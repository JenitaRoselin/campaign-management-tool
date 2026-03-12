"""
Database helper module for campaign management system
Provides connection pooling and query functions
"""

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from contextlib import contextmanager
import os
from pathlib import Path
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Database configuration - automatically loads from .env file or environment variables
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME', 'postgres'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'password'),
    'port': int(os.getenv('DB_PORT', 5432))
}

ssl_mode = os.getenv('DB_SSLMODE')
ssl_root_cert = os.getenv('DB_SSLROOTCERT')
connect_timeout = os.getenv('DB_CONNECT_TIMEOUT')

if ssl_mode:
    DB_CONFIG['sslmode'] = ssl_mode

if ssl_root_cert:
    cert_path = ssl_root_cert
    if not os.path.isabs(cert_path):
        cert_path = str((Path(__file__).resolve().parent / cert_path).resolve())
    DB_CONFIG['sslrootcert'] = cert_path

if connect_timeout:
    DB_CONFIG['connect_timeout'] = int(connect_timeout)

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()

def get_cursor(conn):
    """Get a cursor with dictionary results"""
    return conn.cursor(cursor_factory=RealDictCursor)

# ==================== TENANT FUNCTIONS ====================

def get_tenant_by_name(tenant_name: str) -> Optional[Dict]:
    """Get tenant by name"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute(
                "SELECT * FROM jenita_dev.tenants WHERE tenant_name = %s;",
                (tenant_name,)
            )
            return dict(cursor.fetchone()) if cursor.rowcount > 0 else None

def get_default_tenant() -> Dict:
    """Get the default Demo Store tenant"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute(
                "SELECT * FROM jenita_dev.tenants WHERE tenant_name = 'Demo Store' LIMIT 1;"
            )
            result = cursor.fetchone()
            return dict(result) if result else None

# ==================== CUSTOMER FUNCTIONS ====================

def get_all_customers(tenant_id: str) -> List[Dict]:
    """Get all customers for a tenant with calculated RFM metrics"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                SELECT 
                    c.*,
                    COUNT(ph.purchase_id) as total_purchases,
                    COALESCE(SUM(ph.item_price), 0) as total_spent,
                    COALESCE(
                        EXTRACT(DAY FROM (NOW() - MAX(ph.purchase_timestamp))),
                        365
                    ) as recency
                FROM jenita_dev.customers c
                LEFT JOIN jenita_dev.purchase_history ph ON c.customer_id = ph.customer_id
                WHERE c.tenant_id = %s
                GROUP BY c.customer_id
                ORDER BY total_spent DESC;
            """, (tenant_id,))
            return [dict(row) for row in cursor.fetchall()]

def get_customer_with_purchases(customer_id: str) -> Dict:
    """Get customer details with purchase history"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                SELECT 
                    c.*,
                    json_agg(
                        json_build_object(
                            'item_name', ph.item_name,
                            'item_category', ph.item_category,
                            'item_price', ph.item_price,
                            'discount_given', ph.discount_given,
                            'purchase_timestamp', ph.purchase_timestamp
                        )
                    ) as purchases
                FROM jenita_dev.customers c
                LEFT JOIN jenita_dev.purchase_history ph ON c.customer_id = ph.customer_id
                WHERE c.customer_id = %s
                GROUP BY c.customer_id;
            """, (customer_id,))
            return dict(cursor.fetchone()) if cursor.rowcount > 0 else None

def update_customer_segment(customer_id: str, segment_tag: str):
    """Update customer's segment tag"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                UPDATE jenita_dev.customers 
                SET segment_tag = %s 
                WHERE customer_id = %s;
            """, (segment_tag, customer_id))


def update_customer_segments_bulk(customer_segments: List[Dict[str, str]]):
    """Bulk update customer segment tags in a single DB round trip"""
    if not customer_segments:
        return

    values = [
        (segment['customer_id'], segment['segment_name'])
        for segment in customer_segments
    ]

    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            execute_values(
                cursor,
                """
                UPDATE jenita_dev.customers AS c
                SET segment_tag = data.segment_name
                FROM (VALUES %s) AS data(customer_id, segment_name)
                WHERE c.customer_id::text = data.customer_id;
                """,
                values,
            )

# ==================== CAMPAIGN FUNCTIONS ====================

def get_all_campaigns(tenant_id: str) -> List[Dict]:
    """Get all campaigns for a tenant with engagement metrics"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                SELECT 
                    c.*,
                    COUNT(DISTINCT eh.customer_id) as total_recipients,
                    SUM(eh.no_of_opens) as total_opens,
                    SUM(eh.no_of_clicks) as total_clicks,
                    SUM(eh.replies) as total_replies,
                    CASE 
                        WHEN COUNT(DISTINCT eh.customer_id) > 0 
                        THEN ROUND((SUM(eh.no_of_opens)::NUMERIC / COUNT(DISTINCT eh.customer_id) * 100), 2)
                        ELSE 0 
                    END as open_rate,
                    CASE 
                        WHEN SUM(eh.no_of_opens) > 0 
                        THEN ROUND((SUM(eh.no_of_clicks)::NUMERIC / SUM(eh.no_of_opens) * 100), 2)
                        ELSE 0 
                    END as click_rate
                FROM jenita_dev.campaigns c
                LEFT JOIN jenita_dev.engagement_history eh ON c.campaign_id = eh.campaign_id
                WHERE c.tenant_id = %s
                GROUP BY c.campaign_id
                ORDER BY c.created_at DESC;
            """, (tenant_id,))
            return [dict(row) for row in cursor.fetchall()]

def get_campaign_by_id(campaign_id: str) -> Optional[Dict]:
    """Get campaign details by ID"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                SELECT * FROM jenita_dev.campaigns 
                WHERE campaign_id = %s;
            """, (campaign_id,))
            return dict(cursor.fetchone()) if cursor.rowcount > 0 else None

def create_campaign(tenant_id: str, campaign_data: Dict) -> str:
    """Create a new campaign and return campaign_id"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                INSERT INTO jenita_dev.campaigns 
                (tenant_id, campaign_name, budget, language, objective, tone, 
                 target_audience_filter, smart_context, status, run_count, last_run_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING campaign_id;
            """, (
                tenant_id,
                campaign_data.get('campaign_name'),
                campaign_data.get('budget'),
                campaign_data.get('language', 'English'),
                campaign_data.get('objective'),
                campaign_data.get('tone'),
                psycopg2.extras.Json(campaign_data.get('target_audience_filter', {})),
                campaign_data.get('smart_context'),
                'active',
                1,
                campaign_data.get('last_run_at')
            ))
            return cursor.fetchone()['campaign_id']

def update_campaign_run_count(campaign_id: str):
    """Increment campaign run count"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                UPDATE jenita_dev.campaigns 
                SET run_count = run_count + 1, 
                    last_run_at = NOW(),
                    status = 'active'
                WHERE campaign_id = %s;
            """, (campaign_id,))

# ==================== CAMPAIGN DETAILS FUNCTIONS ====================

def save_campaign_details(campaign_id: str, segments: List[Dict]):
    """Save segment-specific messages for a campaign"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            # Delete existing details
            cursor.execute("""
                DELETE FROM jenita_dev.campaign_details 
                WHERE campaign_id = %s;
            """, (campaign_id,))
            
            # Insert new details
            details_data = [
                (campaign_id, seg['segment_name'], seg.get('is_recommended', False),
                 seg['generated_message'], seg.get('customer_count', 0))
                for seg in segments
            ]
            
            execute_values(cursor, """
                INSERT INTO jenita_dev.campaign_details 
                (campaign_id, segment_name, is_recommended, generated_message, customer_count)
                VALUES %s;
            """, details_data)

def get_campaign_details(campaign_id: str) -> List[Dict]:
    """Get segment details for a campaign"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                SELECT * FROM jenita_dev.campaign_details 
                WHERE campaign_id = %s
                ORDER BY is_recommended DESC, customer_count DESC;
            """, (campaign_id,))
            return [dict(row) for row in cursor.fetchall()]

# ==================== ENGAGEMENT FUNCTIONS ====================

def record_engagement(tenant_id: str, campaign_id: str, customer_id: str, 
                     opens: int = 0, clicks: int = 0, replies: int = 0):
    """Record or update engagement for a customer"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                INSERT INTO jenita_dev.engagement_history 
                (tenant_id, campaign_id, customer_id, no_of_opens, no_of_clicks, replies)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (engagement_id) DO UPDATE SET
                    no_of_opens = jenita_dev.engagement_history.no_of_opens + EXCLUDED.no_of_opens,
                    no_of_clicks = jenita_dev.engagement_history.no_of_clicks + EXCLUDED.no_of_clicks,
                    replies = jenita_dev.engagement_history.replies + EXCLUDED.replies,
                    updated_at = NOW();
            """, (tenant_id, campaign_id, customer_id, opens, clicks, replies))

def get_campaign_engagement(campaign_id: str) -> List[Dict]:
    """Get engagement metrics for a campaign"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                SELECT 
                    eh.*,
                    c.customer_name,
                    c.customer_email,
                    c.segment_tag
                FROM jenita_dev.engagement_history eh
                JOIN jenita_dev.customers c ON eh.customer_id = c.customer_id
                WHERE eh.campaign_id = %s
                ORDER BY eh.updated_at DESC;
            """, (campaign_id,))
            return [dict(row) for row in cursor.fetchall()]

def delete_campaign_complete(campaign_id: str) -> bool:
    """Delete campaign rows in required order: engagement_history, campaign_details, campaigns"""
    try:
        with get_db_connection() as conn:
            with get_cursor(conn) as cursor:
                # 1) Delete from engagement_history
                cursor.execute(
                    "DELETE FROM jenita_dev.engagement_history WHERE campaign_id = %s;",
                    (campaign_id,)
                )
                deleted_engagement = cursor.rowcount
                
                # 2) Delete from campaign_details
                cursor.execute(
                    "DELETE FROM jenita_dev.campaign_details WHERE campaign_id = %s;",
                    (campaign_id,)
                )
                deleted_details = cursor.rowcount
                
                # 3) Delete from campaigns
                cursor.execute(
                    "DELETE FROM jenita_dev.campaigns WHERE campaign_id = %s;",
                    (campaign_id,)
                )
                deleted_campaigns = cursor.rowcount
                
                print(f"Deleted campaign {campaign_id}: engagement={deleted_engagement}, details={deleted_details}, campaigns={deleted_campaigns}")
                return deleted_campaigns > 0
    except Exception as e:
        print(f"Error deleting campaign {campaign_id}: {e}")
        return False

def delete_campaign(campaign_id: str) -> bool:
    """Backward-compatible wrapper for existing callers"""
    return delete_campaign_complete(campaign_id)

def get_roi_metrics(campaign_id: str) -> Dict:
    """Get ROI metrics for a campaign"""
    with get_db_connection() as conn:
        with get_cursor(conn) as cursor:
            cursor.execute("""
                SELECT 
                    c.campaign_name,
                    c.budget,
                    COUNT(DISTINCT eh.customer_id) as total_sent,
                    SUM(eh.no_of_opens) as total_opens,
                    SUM(eh.no_of_clicks) as total_clicks,
                    SUM(eh.replies) as total_replies,
                    ROUND(AVG(eh.no_of_opens::NUMERIC), 2) as avg_opens_per_customer,
                    ROUND(AVG(eh.no_of_clicks::NUMERIC), 2) as avg_clicks_per_customer,
                    CASE 
                        WHEN COUNT(DISTINCT eh.customer_id) > 0 
                        THEN ROUND((SUM(eh.no_of_opens)::NUMERIC / COUNT(DISTINCT eh.customer_id) * 100), 2)
                        ELSE 0 
                    END as open_rate,
                    CASE 
                        WHEN SUM(eh.no_of_opens) > 0 
                        THEN ROUND((SUM(eh.no_of_clicks)::NUMERIC / SUM(eh.no_of_opens) * 100), 2)
                        ELSE 0 
                    END as click_through_rate,
                    CASE 
                        WHEN COUNT(DISTINCT eh.customer_id) > 0 
                        THEN ROUND((SUM(eh.replies)::NUMERIC / COUNT(DISTINCT eh.customer_id) * 100), 2)
                        ELSE 0 
                    END as reply_rate
                FROM jenita_dev.campaigns c
                LEFT JOIN jenita_dev.engagement_history eh ON c.campaign_id = eh.campaign_id
                WHERE c.campaign_id = %s
                GROUP BY c.campaign_id;
            """, (campaign_id,))
            result = cursor.fetchone()
            return dict(result) if result else None
