import os
import re
import html
import requests
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Cache variables to prevent rate limiting / slow loads
_feed_cache = None

def clean_html_to_text(html_content):
    """Strips HTML tags and unescapes HTML entities to get clean plain text."""
    if not html_content:
        return ""
    # Replace common block elements with spaces to avoid joining words
    s = re.sub(r'(?i)</?(p|div|h1|h2|h3|h4|h5|h6|li|tr|td)[^>]*>', ' ', html_content)
    # Strip remaining HTML tags
    s = re.sub(r'<[^>]+>', '', s)
    # Unescape HTML entities
    s = html.unescape(s)
    # Normalize whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def fetch_and_parse_feed():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
    except Exception as e:
        return {"error": f"Failed to fetch feed: {str(e)}"}

    try:
        root = ET.fromstring(r.content)
    except Exception as e:
        return {"error": f"Failed to parse XML: {str(e)}"}

    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    feed_title = root.find('atom:title', ns)
    feed_title = feed_title.text if feed_title is not None else "BigQuery Release Notes"
    
    feed_updated = root.find('atom:updated', ns)
    feed_updated = feed_updated.text if feed_updated is not None else ""
    
    entries_data = []
    
    for entry in root.findall('atom:entry', ns):
        title = entry.find('atom:title', ns)
        title = title.text if title is not None else "Unknown Date"
        
        entry_id = entry.find('atom:id', ns)
        entry_id = entry_id.text if entry_id is not None else ""
        
        entry_updated = entry.find('atom:updated', ns)
        entry_updated = entry_updated.text if entry_updated is not None else ""
        
        # Link
        link_elem = entry.find("atom:link[@rel='alternate']", ns)
        if link_elem is None:
            link_elem = entry.find("atom:link", ns)
        link = link_elem.get('href') if link_elem is not None else ""
        
        content_elem = entry.find('atom:content', ns)
        raw_html = content_elem.text if content_elem is not None else ""
        
        # Parse content into sub-updates based on h3 tags
        updates = []
        if raw_html:
            parts = re.split(r'(?i)<h3>', raw_html)
            
            # If there is content before the first h3, we add it under 'General'
            first_part = parts[0].strip()
            if first_part:
                # Let's see if there's actual readable text
                plain_txt = clean_html_to_text(first_part)
                if plain_txt:
                    updates.append({
                        "category": "General",
                        "body": first_part,
                        "text": plain_txt
                    })
            
            # Parse sections following h3 tags
            for part in parts[1:]:
                subparts = part.split('</h3>', 1)
                if len(subparts) == 2:
                    category, body = subparts
                    category = category.strip()
                    body = body.strip()
                    
                    plain_txt = clean_html_to_text(body)
                    updates.append({
                        "category": category,
                        "body": body,
                        "text": plain_txt
                    })
        
        entries_data.append({
            "date": title,
            "id": entry_id,
            "updated": entry_updated,
            "link": link,
            "updates": updates
        })
        
    return {
        "title": feed_title,
        "updated": feed_updated,
        "entries": entries_data
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    global _feed_cache
    
    if _feed_cache is None or force_refresh:
        data = fetch_and_parse_feed()
        if "error" not in data:
            _feed_cache = data
        else:
            # If error and we have cached data, fallback to cache
            if _feed_cache is not None:
                return jsonify({**_feed_cache, "warning": data["error"], "from_cache": True})
            return jsonify(data), 500
            
    return jsonify({**_feed_cache, "from_cache": not force_refresh})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
