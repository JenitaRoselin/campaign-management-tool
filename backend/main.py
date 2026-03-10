import os
import base64
import json
import io
import requests
from typing import List, Optional
from email.message import EmailMessage
from urllib.parse import urlencode
from datetime import datetime

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Google Auth & API
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

# Custom Logic
from customer_segmentation_ai import CustomerSegmentationAI
from campaign_engine import CampaignEngine
import database as db

# --- CRITICAL FIX: Allow HTTP and bypass PKCE memory issues ---
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- INITIALIZATION ---
ai_model = CustomerSegmentationAI(n_clusters=4)
HF_TOKEN = os.getenv("HF_TOKEN", "")
campaign_engine = CampaignEngine(hf_token=HF_TOKEN)
SCOPES = ['https://www.googleapis.com/auth/gmail.send']

# --- MODELS ---
class CampaignRequest(BaseModel):
    tenant_name: str
    item: str
    price: float
    cat: str
    disc: int
    customer_data: List[dict]
    other_details: Optional[str] = ""

class EmailRequest(BaseModel):
    recipient: str
    subject: str
    body: str

# New Models for Database Integration
class CreateCampaignRequest(BaseModel):
    campaign_name: str
    budget: Optional[float] = None
    language: str = "English"
    objective: str
    tone: str
    target_audience_filter: Optional[dict] = {}
    smart_context: Optional[str] = ""
    customer_data: List[dict]  # Filtered customers with segments

class BulkEmailRequest(BaseModel):
    campaign_id: str
    segment_messages: List[dict]  # List of {segment_name, customer_ids, message, subject}

class SegmentCustomersRequest(BaseModel):
    customer_ids: Optional[List[str]] = None  # If None, fetch all customers
    n_clusters: Optional[int] = None  # Dynamic clustering

# --- AUTH ENDPOINTS ---

@app.get("/api/auth/google")
async def google_auth():
    """Generates a clean Auth URL without PKCE challenges."""
    with open('client_secret.json', 'r') as f:
        client_data = json.load(f)['web']
    
    # Manually construct the URL to bypass the library's automatic PKCE
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": client_data['client_id'],
        "redirect_uri": "http://localhost:8000/callback",
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent"
    }
    
    # Build the full URL
    auth_url = f"{base_url}?{urlencode(params)}"
    
    return {"url": auth_url}

@app.get("/callback")
async def callback(request: Request):
    """Exchanges the code for a token without needing a verifier."""
    try:
        code = request.query_params.get("code")
        if not code:
            return {"error": "No code found"}

        with open('client_secret.json', 'r') as f:
            client_data = json.load(f)['web']

        # Manual token exchange
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "code": code,
            "client_id": client_data['client_id'],
            "client_secret": client_data['client_secret'],
            "redirect_uri": "http://localhost:8000/callback",
            "grant_type": "authorization_code",
        }

        response = requests.post(token_url, data=data)
        token_data = response.json()

        if "error" in token_data:
            return {"error": "Google Rejected Code", "detail": token_data}

        # Save to token.json
        with open('token.json', 'w') as token_file:
            json.dump(token_data, token_file)

        return {"status": "Success", "message": "token.json created! You can now send emails."}

    except Exception as e:
        return {"error": "Authentication Failed", "detail": str(e)}

# --- CORE FEATURE ENDPOINTS ---

# ==================== DATABASE-DRIVEN ENDPOINTS ====================

@app.get("/api/campaigns")
async def get_campaigns():
    """Get all campaigns with metrics for the default tenant"""
    try:
        tenant = db.get_default_tenant()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        campaigns = db.get_all_campaigns(tenant['tenant_id'])
        return {"status": "success", "campaigns": campaigns}
    except Exception as e:
        print(f"Error fetching campaigns: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/campaigns/{campaign_id}")
async def get_campaign_details_endpoint(campaign_id: str):
    """Get detailed information about a specific campaign"""
    try:
        campaign = db.get_campaign_by_id(campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        campaign_details = db.get_campaign_details(campaign_id)
        return {
            "status": "success",
            "campaign": campaign,
            "details": campaign_details
        }
    except Exception as e:
        print(f"Error fetching campaign details: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/campaigns/{campaign_id}/roi")
async def get_campaign_roi(campaign_id: str):
    """Get ROI metrics for a campaign"""
    try:
        roi_data = db.get_roi_metrics(campaign_id)
        engagement_data = db.get_campaign_engagement(campaign_id)
        
        return {
            "status": "success",
            "roi": roi_data,
            "engagement": engagement_data
        }
    except Exception as e:
        print(f"Error fetching ROI data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/customers")
async def get_all_customers_endpoint():
    """Get all customers for the default tenant"""
    try:
        tenant = db.get_default_tenant()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        customers = db.get_all_customers(tenant['tenant_id'])
        
        # Transform field names to match frontend expectations
        for customer in customers:
            customer['frequency'] = int(customer.get('total_purchases', 0) or 0)
            customer['monetary'] = float(customer.get('total_spent', 0) or 0)
            # recency is already calculated in the DB query, just ensure it's an int
            customer['recency'] = int(customer.get('recency', 365))
            
        return {"status": "success", "customers": customers}
    except Exception as e:
        print(f"Error fetching customers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/segment-customers-dynamic")
async def segment_customers_dynamic(req: SegmentCustomersRequest):
    """
    Dynamically segment a subset of customers using AI
    No CSV upload needed - fetches from database
    """
    try:
        tenant = db.get_default_tenant()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Get all customers from DB
        all_customers = db.get_all_customers(tenant['tenant_id'])
        
        # Filter if specific customer_ids provided
        if req.customer_ids:
            selected_ids = {str(customer_id) for customer_id in req.customer_ids}
            customers = [c for c in all_customers if str(c['customer_id']) in selected_ids]
        else:
            customers = all_customers
        
        if len(customers) == 0:
            raise HTTPException(status_code=400, detail="No customers found to segment")
        
        # Convert DB-aggregated customer rows into AI-compatible transaction-like rows
        # Expected by CustomerSegmentationAI: customer_id, send_timestamp, item_price, discount_given
        prepared_rows = []
        for customer in customers:
            total_purchases = int(customer.get('total_purchases') or 0)
            purchase_count = max(1, total_purchases)
            total_spent = float(customer.get('total_spent') or 0)
            average_item_price = total_spent / purchase_count if purchase_count > 0 else 0

            send_timestamp = customer.get('created_at') or datetime.now().isoformat()

            discount_value_raw = customer.get('discount_sensitivity')
            try:
                discount_given = float(discount_value_raw) if discount_value_raw is not None else 0.0
            except (TypeError, ValueError):
                discount_given = 0.0

            for _ in range(purchase_count):
                prepared_rows.append({
                    'customer_id': customer['customer_id'],
                    'send_timestamp': send_timestamp,
                    'item_price': average_item_price,
                    'discount_given': discount_given
                })

        df = pd.DataFrame(prepared_rows)
        
        # Determine number of clusters dynamically
        n_clusters = req.n_clusters if req.n_clusters else min(4, max(2, len(customers) // 20))
        
        # Re-initialize AI model with dynamic clusters
        dynamic_ai = CustomerSegmentationAI(n_clusters=n_clusters)
        segmented_df = dynamic_ai.process_dataframe(df)
        
        # Update segment tags in database (bulk, single round trip)
        segment_updates = [
            {
                'customer_id': str(row['customer_id']),
                'segment_name': str(row['segment_name'])
            }
            for _, row in segmented_df.iterrows()
        ]
        db.update_customer_segments_bulk(segment_updates)

        return {
            "status": "success",
            "data": segmented_df.to_dict(orient="records"),
            "summary": dynamic_ai.get_segment_stats(segmented_df),
            "n_clusters": n_clusters
        }
    except Exception as e:
        print(f"Error in dynamic segmentation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/campaigns")
async def create_campaign_endpoint(req: CreateCampaignRequest):
    """Create a new campaign and save to database"""
    try:
        tenant = db.get_default_tenant()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Create campaign in database
        campaign_data = {
            'campaign_name': req.campaign_name,
            'budget': req.budget,
            'language': req.language,
            'objective': req.objective,
            'tone': req.tone,
            'target_audience_filter': req.target_audience_filter,
            'smart_context': req.smart_context,
            'last_run_at': datetime.now()
        }
        
        campaign_id = db.create_campaign(tenant['tenant_id'], campaign_data)
        
        # Generate AI messages for each segment
        # Group customers by segment
        segments = {}
        for customer in req.customer_data:
            segment = customer.get('segment_name', 'Unknown')
            if segment not in segments:
                segments[segment] = {
                    'customers': [],
                    'avg_spend': 0,
                    'count': 0
                }
            segments[segment]['customers'].append(customer)
            segments[segment]['avg_spend'] += customer.get('total_spent', 0)
            segments[segment]['count'] += 1
        
        # Calculate average spend and rank segments
        segment_details = []
        for segment_name, data in segments.items():
            data['avg_spend'] = data['avg_spend'] / data['count'] if data['count'] > 0 else 0
            segment_details.append({
                'segment_name': segment_name,
                'customer_count': data['count'],
                'avg_spend': data['avg_spend'],
                'customers': data['customers']
            })
        
        # Sort by avg_spend and mark top 2 as recommended
        segment_details.sort(key=lambda x: x['avg_spend'], reverse=True)
        
        # Generate messages using campaign engine
        generated_segments = []
        for i, segment in enumerate(segment_details):
            is_recommended = i < 2  # Top 2 segments
            
            # Use campaign engine to generate message
            # For now, create a simple template-based message
            message = campaign_engine.generate_segment_message(
                tenant_name=tenant['tenant_name'],
                segment_name=segment['segment_name'],
                tone=req.tone,
                objective=req.objective,
                context=req.smart_context
            )
            
            generated_segments.append({
                'segment_name': segment['segment_name'],
                'is_recommended': is_recommended,
                'generated_message': message,
                'customer_count': segment['customer_count']
            })
        
        # Save campaign details
        db.save_campaign_details(campaign_id, generated_segments)
        
        return {
            "status": "success",
            "campaign_id": campaign_id,
            "segments": generated_segments
        }
    except Exception as e:
        print(f"Error creating campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/campaigns/{campaign_id}/run")
async def run_campaign(campaign_id: str, email_req: BulkEmailRequest):
    """
    Run a campaign by sending emails to filtered recipients
    For development: Only sends to whitelisted emails
    """
    WHITELISTED_EMAILS = [
        "jeniroselin20@gmail.com",
        "yuvasrieswara77@gmail.com"
    ]
    
    if not os.path.exists('token.json'):
        raise HTTPException(status_code=401, detail="Please authenticate via /api/auth/google first")
    
    try:
        tenant = db.get_default_tenant()
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        service = build('gmail', 'v1', credentials=creds)
        
        sent_count = 0
        failed_count = 0
        
        # Process each segment's messages
        for segment_msg in email_req.segment_messages:
            segment_name = segment_msg['segment_name']
            customer_ids = segment_msg['customer_ids']
            message_body = segment_msg['message']
            subject = segment_msg['subject']
            
            for customer_id in customer_ids:
                # Get customer email
                customer = db.get_customer_with_purchases(customer_id)
                if not customer or not customer.get('customer_email'):
                    continue
                
                recipient_email = customer['customer_email']
                
                # DEVELOPMENT FILTER: Only send to whitelisted emails
                if recipient_email not in WHITELISTED_EMAILS:
                    print(f"Skipping {recipient_email} (not whitelisted)")
                    continue
                
                try:
                    # Send email
                    message = EmailMessage()
                    message.set_content(message_body)
                    message['To'] = recipient_email
                    message['From'] = "me"
                    message['Subject'] = subject
                    
                    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
                    service.users().messages().send(
                        userId="me",
                        body={'raw': encoded_message}
                    ).execute()
                    
                    # Record engagement (initial send)
                    db.record_engagement(
                        tenant['tenant_id'],
                        campaign_id,
                        customer_id,
                        opens=0,
                        clicks=0,
                        replies=0
                    )
                    
                    sent_count += 1
                except Exception as email_error:
                    print(f"Failed to send to {recipient_email}: {email_error}")
                    failed_count += 1
        
        # Update campaign run count
        db.update_campaign_run_count(campaign_id)
        
        return {
            "status": "success",
            "sent": sent_count,
            "failed": failed_count,
            "message": f"Campaign sent to {sent_count} recipients (whitelisted only)"
        }
    except Exception as e:
        print(f"Error running campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== LEGACY ENDPOINTS (Keep for backward compatibility) ====================

@app.post("/api/segment-customers")
async def segment_customers(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        segmented_df = ai_model.process_dataframe(df)
        return {
            "status": "success", 
            "data": segmented_df.to_dict(orient="records"), 
            "summary": ai_model.get_segment_stats(segmented_df)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-campaign")
async def generate_campaign(req: CampaignRequest):
    try:
        # Generate messages for Top 2 segments (logic inside campaign_engine.py)
        campaigns = campaign_engine.generate_copy(
            req.tenant_name, req.item, req.price, req.cat, req.disc, 
            req.customer_data, req.other_details
        )
        return {"status": "success", "campaigns": campaigns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/send-email")
async def send_email(req: EmailRequest):
    if not os.path.exists('token.json'):
        raise HTTPException(status_code=401, detail="Please authenticate via /api/auth/google first")
    try:
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        service = build('gmail', 'v1', credentials=creds)
        
        message = EmailMessage()
        message.set_content(req.body)
        message['To'] = req.recipient
        message['From'] = "me"
        message['Subject'] = req.subject

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId="me", body={'raw': encoded_message}).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)