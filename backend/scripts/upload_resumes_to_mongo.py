"""
Upload resume PDFs to MongoDB GridFS and update MySQL member resume_urls
Run from project root: python backend/scripts/upload_resumes_to_mongo.py
"""
import os
import sys
from pathlib import Path
import pymongo
from gridfs import GridFS
from sqlalchemy import create_engine, text

# Connection strings
MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "linkedin_simulation"
MYSQL_URI = "mysql+pymysql://root:linkedin_pass@localhost:3307/linkedin_simulation"

def main():
    # Connect to databases
    mongo_client = pymongo.MongoClient(MONGO_URI)
    mongo_db = mongo_client[MONGO_DB]
    fs = GridFS(mongo_db, collection='resumes')
    
    mysql_engine = create_engine(MYSQL_URI)
    
    # Find all PDF files
    resume_dir = Path("datasets/resumes/data/data")
    pdf_files = list(resume_dir.rglob("*.pdf"))
    
    print(f"Found {len(pdf_files)} PDF files")
    
    # Get member count from MySQL
    with mysql_engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) as cnt FROM members"))
        member_count = result.fetchone()[0]
        print(f"Found {member_count} members in MySQL")
    
    # Upload PDFs and update MySQL
    uploaded = 0
    for idx, pdf_path in enumerate(pdf_files[:member_count], start=1):
        try:
            # Read PDF
            with open(pdf_path, 'rb') as pdf_file:
                pdf_data = pdf_file.read()
            
            # Upload to GridFS
            file_id = fs.put(
                pdf_data,
                filename=pdf_path.name,
                member_id=idx,
                content_type='application/pdf'
            )
            
            # Update MySQL with MongoDB URL
            mongo_url = f"mongodb://resumes/{file_id}"
            with mysql_engine.connect() as conn:
                conn.execute(
                    text("UPDATE members SET resume_url = :url WHERE member_id = :id"),
                    {"url": mongo_url, "id": idx}
                )
                conn.commit()
            
            uploaded += 1
            if uploaded % 100 == 0:
                print(f"Uploaded {uploaded}/{member_count} resumes...")
                
        except Exception as e:
            print(f"Error uploading {pdf_path.name}: {e}")
    
    print(f"\n✅ Complete! Uploaded {uploaded} resumes to MongoDB")

if __name__ == "__main__":
    main()
