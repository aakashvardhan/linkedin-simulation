"""
Seed 10,000 member resume PDFs into MongoDB GridFS.
Cycles through available PDFs to create one GridFS file per member.

Run: python3 backend/scripts/seed_resumes_gridfs.py
"""
import os
import sys
from pathlib import Path
from gridfs import GridFS
import pymongo
from bson.objectid import ObjectId

# Paths
REPO_ROOT = Path(__file__).parent.parent.parent
RESUME_DIR = REPO_ROOT / 'datasets' / 'resumes' / 'data' / 'data'
TARGET_COUNT = 10000

# MongoDB connection
MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "linkedin_simulation"

def find_all_pdfs(directory):
    """Recursively find all PDF files."""
    pdf_files = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.lower().endswith('.pdf'):
                pdf_files.append(os.path.join(root, file))
    return sorted(pdf_files)

def main():
    print(f"Looking for PDFs in: {RESUME_DIR}")
    
    # Find all PDFs
    pdf_files = find_all_pdfs(RESUME_DIR)
    
    if not pdf_files:
        print(f"❌ No PDF files found in {RESUME_DIR}")
        sys.exit(1)
    
    print(f"✅ Found {len(pdf_files)} source PDFs")
    print(f"📤 Seeding {TARGET_COUNT} GridFS files...\n")
    
    # Connect to MongoDB
    client = pymongo.MongoClient(MONGO_URI)
    db = client[MONGO_DB]
    fs = GridFS(db, collection='resumes')
    
    # Clear existing resumes
    print("🗑️  Clearing existing resumes...")
    db['resumes.files'].delete_many({})
    db['resumes.chunks'].delete_many({})
    
    # Upload resumes
    uploaded = 0
    for member_id in range(1, TARGET_COUNT + 1):
        # Cycle through available PDFs
        pdf_path = pdf_files[(member_id - 1) % len(pdf_files)]
        
        # Create consistent file ID
        file_id = f"member_{str(member_id).zfill(6)}"
        
        # Read PDF
        with open(pdf_path, 'rb') as pdf_file:
            pdf_data = pdf_file.read()
        
        # Store in GridFS with custom _id
        fs.put(
            pdf_data,
            _id=file_id,
            filename=os.path.basename(pdf_path),
            content_type='application/pdf',
            metadata={
                'member_id': member_id,
                'source_path': os.path.relpath(pdf_path, REPO_ROOT),
                'source_index': (member_id - 1) % len(pdf_files)
            }
        )
        
        uploaded += 1
        if uploaded % 500 == 0:
            print(f"Uploaded {uploaded}/{TARGET_COUNT}...")
    
    # Create indexes
    print("\n📑 Creating indexes...")
    db['resumes.files'].create_index('filename')
    db['resumes.files'].create_index('metadata.member_id', unique=True)
    db['resumes.chunks'].create_index([('files_id', 1), ('n', 1)], unique=True)
    
    # Verify
    files_count = db['resumes.files'].count_documents({})
    chunks_count = db['resumes.chunks'].count_documents({})
    
    print(f"\n✅ Complete!")
    print(f"   Resume files: {files_count}")
    print(f"   Resume chunks: {chunks_count}")
    print(f"   Source PDFs used: {len(pdf_files)}")
    
    # Show samples
    print("\n📋 Sample GridFS files:")
    for doc in db['resumes.files'].find().limit(3):
        print(f"   {doc['_id']} → member_id: {doc['metadata']['member_id']}, file: {doc['filename']}")

if __name__ == "__main__":
    main()
