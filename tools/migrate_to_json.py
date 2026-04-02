#!/usr/bin/env python3
"""
Utility to convert existing projects.xml to projects.json
Run this once to migrate your data.
"""

import os
import json
import xml.etree.ElementTree as ET
from pathlib import Path

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
XML_FILE = os.path.join(BASE_DIR, "projects.xml")
JSON_FILE = os.path.join(REPO_ROOT, "assets", "data", "projects.json")

# Ensure output directory exists
Path(os.path.dirname(JSON_FILE)).mkdir(parents=True, exist_ok=True)

def xml_to_json():
    """Convert projects.xml to projects.json"""
    if not os.path.exists(XML_FILE):
        print("No projects.xml found. Creating empty projects.json...")
        projects = []
    else:
        try:
            tree = ET.parse(XML_FILE)
            root = tree.getroot()
            projects = []
            
            for project in root.findall("project"):
                p = {
                    "id": project.get("id", ""),
                    "title": (project.findtext("title") or "").strip(),
                    "meta": (project.findtext("meta") or "").strip(),
                    "description": (project.findtext("description") or "").strip(),
                    "image": (project.findtext("image") or "").strip(),
                    "model_path": (project.findtext("model") or "").strip(),
                    "github_link": (project.findtext("github") or "").strip(),
                    "demo_link": (project.findtext("demo") or "").strip(),
                    "tags": [t.strip() for t in (project.findtext("tags") or "").split(",") if t.strip()],
                }
                projects.append(p)
            
            print(f"✔ Converted {len(projects)} projects from XML")
            
        except Exception as e:
            print(f"Error reading XML: {e}")
            projects = []
    
    # Write JSON
    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(projects, f, indent=2, ensure_ascii=False)
    
    print(f"✔ Saved to: {JSON_FILE}")
    print("\nYou can now use project_manager_pro.py instead of the old manager.")

if __name__ == "__main__":
    xml_to_json()
