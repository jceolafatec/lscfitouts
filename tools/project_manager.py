#!/usr/bin/env python3
"""
Simple local project manager for your portfolio.

- Stores project data in projects.xml
- Lets you add new projects via a text menu
- Generates HTML snippets for project cards that you can paste into index.html

This is intentionally simple so you can convert it to an .exe (e.g., with PyInstaller).
"""

import os
import sys
import textwrap
import xml.etree.ElementTree as ET

XML_FILE = os.path.join(os.path.dirname(__file__), "projects.xml")
OUTPUT_HTML = os.path.join(os.path.dirname(__file__), "projects_snippet.html")


def ensure_xml_exists():
    """Create a basic XML file if it doesn't exist yet."""
    if not os.path.exists(XML_FILE):
        root = ET.Element("projects")
        tree = ET.ElementTree(root)
        tree.write(XML_FILE, encoding="utf-8", xml_declaration=True)


def load_tree():
    ensure_xml_exists()
    tree = ET.parse(XML_FILE)
    return tree, tree.getroot()


def list_projects():
    tree, root = load_tree()
    print("\nCurrent projects:\n" + "-" * 40)
    for project in root.findall("project"):
        pid = project.get("id", "?")
        title = project.findtext("title", "").strip()
        meta = project.findtext("meta", "").strip()
        print(f"[{pid}] {title} – {meta}")
    print("-" * 40 + "\n")


def add_project():
    tree, root = load_tree()

    # Simple incremental ID
    existing_ids = [
        int(p.get("id", "0")) for p in root.findall("project") if p.get("id")
    ]
    next_id = max(existing_ids, default=0) + 1

    print("\nAdd new project")
    print("-" * 40)
    title = input("Title: ").strip()
    meta = input("Meta (e.g. 'UI Design · 2025'): ").strip()
    print("Description (finish with a blank line):")
    desc_lines = []
    while True:
        line = input()
        if line == "":
            break
        desc_lines.append(line)
    description = " ".join(desc_lines).strip()
    image_path = input("Image path (e.g. 'assets/img/project-03.jpg', optional): ").strip()

    project_el = ET.SubElement(root, "project", id=str(next_id))
    ET.SubElement(project_el, "title").text = title
    ET.SubElement(project_el, "meta").text = meta
    ET.SubElement(project_el, "description").text = description
    ET.SubElement(project_el, "image").text = image_path

    tree.write(XML_FILE, encoding="utf-8", xml_declaration=True)
    print(f"\n✔ Project '{title}' added with id {next_id}.\n")


def generate_html_snippet():
    _, root = load_tree()

    cards = []
    for project in root.findall("project"):
        title = project.findtext("title", "").strip()
        meta = project.findtext("meta", "").strip()
        description = project.findtext("description", "").strip()
        image = project.findtext("image", "").strip()

        # If you set an image path, we generate an <img>; otherwise, a placeholder.
        if image:
            media_html = f'''<div class="project-media">
    <img src="{image}" alt="{title}" loading="lazy" />
</div>'''
        else:
            media_html = '''<div class="project-media placeholder">
    <span class="project-media-label">Image</span>
</div>'''

        card_html = f"""<article class="project-card">
    {media_html}
    <div class="project-body">
        <h3 class="project-title">{title}</h3>
        <p class="project-meta">{meta}</p>
        <p class="project-description">
            {description}
        </p>
    </div>
</article>"""

        cards.append(card_html)

    full_html = "\n\n".join(cards)
    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"\n✔ Generated HTML snippet at: {OUTPUT_HTML}")
    print("Copy the <article> blocks into index.html inside the .project-grid.\n")


def menu():
    while True:
        print(textwrap.dedent(
            """
            ==============================
            Portfolio Project Manager
            ==============================
            1) List projects
            2) Add new project
            3) Generate HTML snippet
            4) Exit
            """
        ))
        choice = input("Choose an option (1-4): ").strip()
        if choice == "1":
            list_projects()
        elif choice == "2":
            add_project()
        elif choice == "3":
            generate_html_snippet()
        elif choice == "4":
            print("Goodbye.")
            break
        else:
            print("Invalid choice. Try again.\n")


if __name__ == "__main__":
    try:
        menu()
    except KeyboardInterrupt:
        print("\nInterrupted. Goodbye.")
        sys.exit(0)