import json
import re
from typing import Any, Dict, List

from huggingface_hub import InferenceClient


class CampaignEngine:
    def __init__(self, hf_token: str):
        self.client = InferenceClient(api_key=hf_token)
        self.model_name = "meta-llama/Llama-3.1-8B-Instruct:novita"

    def robust_json_helper(self, text: Any) -> Dict[str, Any]:
        if isinstance(text, dict):
            return text

        raw_text = ""
        if isinstance(text, str):
            raw_text = text.strip()
        elif text is not None:
            raw_text = str(text).strip()

        if not raw_text:
            raise ValueError("Empty AI response")

        fenced_json_match = re.search(
            r"```(?:json)?\s*(.*?)```",
            raw_text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if fenced_json_match:
            raw_text = fenced_json_match.group(1).strip()

        candidates = [raw_text]
        start_idx = raw_text.find("{")
        end_idx = raw_text.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            candidates.append(raw_text[start_idx : end_idx + 1])

        for candidate in candidates:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                try:
                    return json.loads(candidate, strict=False)
                except json.JSONDecodeError:
                    fixed_text = candidate.replace("\r\n", "\n").replace("\r", "\n")
                    fixed_text = re.sub(r"(?<!\\)\n", r"\\n", fixed_text)
                    try:
                        return json.loads(fixed_text)
                    except json.JSONDecodeError:
                        continue

        raise ValueError("Unable to parse JSON from AI response")

    def _extract_json_content(self, text: Any) -> Dict[str, Any]:
        return self.robust_json_helper(text)

    def _normalize_message_content(self, message_content: Any) -> str:
        if isinstance(message_content, list):
            return "".join(
                item.get("text", "") if isinstance(item, dict) else str(item)
                for item in message_content
            ).strip()
        return str(message_content or "").strip()

    def generate_copy(
        self,
        tenant_name: str,
        item: str,
        price: float,
        cat: str,
        disc: int,
        segmentation_results: List[Dict[str, Any]],
        other_details: str = None,
        tone: str = "Professional",
        objective: str = "Sales",
    ) -> List[Dict[str, Any]]:
        segment_data: Dict[str, List[float]] = {}
        for customer in segmentation_results:
            segment_name = customer.get("segment_name") or "General Audience"
            monetary = float(customer.get("monetary", 0) or 0)
            segment_data.setdefault(segment_name, []).append(monetary)

        avg_spends = [
            (name, sum(values) / len(values))
            for name, values in segment_data.items()
            if values
        ]
        top_2 = sorted(avg_spends, key=lambda pair: pair[1], reverse=True)[:2]

        tone_map = {
            "Professional": "formal, respectful, and business-like",
            "Friendly": "warm, conversational, and approachable",
            "Urgent": "time-sensitive, action-oriented, and compelling",
            "Festive": "celebratory, joyful, and exciting",
        }
        objective_map = {
            "Sales": "drive immediate purchases with attractive offers",
            "Engagement": "encourage interaction and build relationships",
            "Retention": "reward loyalty and strengthen connections",
            "Awareness": "introduce new products and educate customers",
        }

        tone_desc = tone_map.get(tone, tone)
        objective_desc = objective_map.get(objective, objective)

        results: List[Dict[str, Any]] = []
        for segment_name, _ in top_2:
            audience_desc = (
                "loyal, high-value shoppers"
                if "Premium" in segment_name
                else "active customers"
            )

            system_message = f"""
            Role: Marketing Expert for {tenant_name}.
            Tone: {tone_desc}.
            Objective: {objective_desc}.

            STRICT RULES:
            1. Do not mention the words '{segment_name}', 'segment', or 'cluster'.
            2. Keep messaging natural and customer-focused.
            3. Sign off as 'The {tenant_name} Team'.
            4. Return ONLY a valid JSON object.
            5. Escape all newlines in string values as '\\n'.
            """.strip()

            user_message = f"""
            Product Details: Name={item}; Category={cat}; Price=₹{price}; Discount={disc}%.
            Audience Description: {audience_desc}.
            Additional Context: {other_details if other_details else 'No additional context provided.'}

            Task: Write a personalized marketing email in JSON format.
            Format: {{"subject": "...", "body": "..."}}
            """.strip()

            try:
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": user_message},
                    ],
                    max_tokens=500,
                )
                text = self._normalize_message_content(response.choices[0].message.content)
                content = self.robust_json_helper(text)
            except Exception as error:
                print(f"AI generation error: {error}")
                content = {
                    "subject": f"Exclusive Offer from {tenant_name}",
                    "body": "Check out our latest collection!",
                }

            results.append(
                {
                    "target_segment": segment_name,
                    "subject": content.get("subject", f"Special Offer from {tenant_name}"),
                    "body": content.get("body", "Check out our latest collection!"),
                }
            )

        return results

    def generate_segment_message(
        self,
        tenant_name: str,
        segment_name: str,
        tone: str = "Professional",
        objective: str = "Sales",
        context: str = "",
    ) -> str:
        tone_map = {
            "Professional": "formal, respectful, and business-like",
            "Friendly": "warm, conversational, and approachable",
            "Urgent": "time-sensitive, action-oriented, and compelling",
            "Festive": "celebratory, joyful, and exciting",
        }
        objective_map = {
            "Sales": "drive immediate purchases with attractive offers",
            "Engagement": "encourage interaction and build relationships",
            "Retention": "reward loyalty and strengthen connections",
            "Awareness": "introduce new products and educate customers",
        }

        tone_desc = tone_map.get(tone, tone)
        objective_desc = objective_map.get(objective, objective)

        system_message = f"""
        Role: Marketing Expert for {tenant_name}.
        Tone: {tone_desc}.
        Objective: {objective_desc}.

        STRICT RULES:
        1. Do not mention segment names or technical terms.
        2. Keep message natural and customer-focused.
        3. Match the specified tone and objective.
        4. Return ONLY a valid JSON object.
        5. Escape all newlines in string values as '\\n'.
        """.strip()

        user_message = f"""
        Task: Create a personalized marketing email in JSON format for the audience '{segment_name}'.
        Context: {context if context else 'No additional context provided.'}
        Format: {{"subject": "...", "body": "..."}}
        """.strip()

        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=400,
            )
            text = self._normalize_message_content(response.choices[0].message.content)
            print(f"DEBUG: AI Raw Response: {text}")
            content = self.robust_json_helper(text)
            return content.get("body", f"Dear Valued Customer,\n\n{context}\n\nBest regards,\n{tenant_name} Team")
        except Exception as error:
            print(f"AI generation error: {error}")
            return f"Dear Valued Customer,\n\n{context}\n\nBest regards,\n{tenant_name} Team"
