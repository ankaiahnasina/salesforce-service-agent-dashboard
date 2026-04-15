import requests
import json
import os

# Salesforce API Configuration
SF_INSTANCE_URL = os.getenv("SF_INSTANCE_URL", "https://your-instance.salesforce.com")
SF_ACCESS_TOKEN = os.getenv("SF_ACCESS_TOKEN")

def sf_request(method, endpoint, data=None):
    """Helper function for Salesforce REST API requests."""
    url = f"{SF_INSTANCE_URL}/services/data/v60.0/{endpoint}"
    headers = {
        "Authorization": f"Bearer {SF_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    response = requests.request(method, url, headers=headers, json=data)
    response.raise_for_status()
    return response.json() if response.text else None

def get_case_details(case_id):
    """Fetch full Case details."""
    return sf_request("GET", f"sobjects/Case/{case_id}")

def get_vehicle_history(account_id):
    """Fetch Customer's Vehicle History (Custom Object or Related List)."""
    query = f"SELECT Id, Service_Date__c, Service_Type__c, Notes__c FROM Vehicle_History__c WHERE Account__c = '{account_id}' ORDER BY Service_Date__c DESC"
    return sf_request("GET", f"query?q={query}")

def update_salesforce_case(case_id, technical_summary):
    """
    Egress: Update the Salesforce Case with a 'Technical Summary'.
    """
    data = {
        "Technical_Summary__c": technical_summary,
        "Status": "In Progress",
        "Internal_Comments__c": f"Automated Analysis Complete: {technical_summary[:200]}..."
    }
    return sf_request("PATCH", f"sobjects/Case/{case_id}", data)

def create_followup_task(case_id, owner_id, subject):
    """
    Egress: Create a 'Follow-up Task' for a human technician.
    """
    data = {
        "Subject": subject,
        "WhatId": case_id,
        "OwnerId": owner_id,
        "Status": "Not Started",
        "Priority": "Normal",
        "ActivityDate": "2024-04-20" # Example date
    }
    return sf_request("POST", "sobjects/Task", data)

def post_critical_notification(case_subject, sentiment):
    """
    Egress: Post a Slack/Teams notification if sentiment is 'Critical'.
    """
    if sentiment == "Critical":
        webhook_url = os.getenv("SLACK_WEBHOOK_URL")
        if webhook_url:
            payload = {
                "text": f"🚨 *CRITICAL CASE ALERT*\n*Subject:* {case_subject}\n*Action:* Technical summary generated. Technician task created."
            }
            requests.post(webhook_url, json=payload)
            print("Slack notification sent.")

def process_closed_loop_case(case_id):
    """
    Main orchestration function for the 'Closed-Loop' operation.
    """
    try:
        # 1. Ingress & Context Gathering
        print(f"Processing Case: {case_id}")
        case = get_case_details(case_id)
        account_id = case.get("AccountId")
        history = get_vehicle_history(account_id)
        
        # 2. Analysis (RAG Simulation)
        # In a real system, you would pass 'case' and 'history' to a RAG pipeline.
        technical_summary = "Based on the technical manual (Section 4.2), the overheating is likely due to a faulty thermostat. Vehicle history shows a coolant flush 6 months ago, which might be related."
        
        # 3. Egress
        update_salesforce_case(case_id, technical_summary)
        create_followup_task(case_id, case.get("OwnerId"), "Inspect Thermostat & Cooling System")
        post_critical_notification(case.get("Subject"), "Critical")
        
        print("Closed-loop operation successful.")
        
    except Exception as e:
        print(f"Error in closed-loop operation: {e}")
        # State Persistence: In a real system, you would push this back to a retry queue.

if __name__ == "__main__":
    # Example usage
    # process_closed_loop_case("5001I000001ABC")
    pass
