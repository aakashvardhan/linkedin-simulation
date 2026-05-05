"""
Update MySQL members.resume_url to point to MongoDB GridFS files.
After running seed_resumes_gridfs.js, this syncs MySQL with the new GridFS IDs.

Run: python3 backend/scripts/update_mysql_resume_urls.py
"""
import sys
from sqlalchemy import create_engine, text

# MySQL connection
MYSQL_URI = "mysql+pymysql://root:linkedin_pass@localhost:3307/linkedin_simulation"

def main():
    engine = create_engine(MYSQL_URI)
    
    print("Updating MySQL resume URLs to match MongoDB GridFS file IDs...")
    
    with engine.connect() as conn:
        # Update all members to use the new GridFS file ID format
        # GridFS file IDs are: member_000001, member_000002, etc.
        result = conn.execute(text("""
            UPDATE members 
            SET resume_url = CONCAT('mongodb://resumes/', 
                                    'member_', 
                                    LPAD(member_id, 6, '0'))
            WHERE member_id <= 10000
        """))
        conn.commit()
        
        print(f"✅ Updated {result.rowcount} member resume URLs")
        
        # Verify
        sample = conn.execute(text("""
            SELECT member_id, first_name, last_name, resume_url 
            FROM members 
            WHERE member_id IN (1, 100, 1000, 5000, 10000)
        """))
        
        print("\n📋 Sample resume URLs:")
        for row in sample:
            print(f"  Member {row[0]}: {row[3]}")

if __name__ == "__main__":
    main()
