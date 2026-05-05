/**
 * Seed 10,000 member resume PDFs into MongoDB GridFS.
 *
 * Run from repo root with mongosh:
 *   mongosh mongodb://127.0.0.1:27017/linkedin_simulation scripts/seed/seed_resumes_gridfs.js
 *
 * The repo contains fewer than 10,000 unique PDFs, so this script cycles through
 * the available files and creates one deterministic GridFS file per member:
 *   resumes.files._id = "member_000001" ... "member_010000"
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RESUME_DIR = path.join(ROOT, 'datasets', 'resumes', 'data', 'data');
const TARGET_COUNT = Number(process.env.RESUME_TARGET_COUNT || 10000);
const CHUNK_SIZE = 255 * 1024;

function walkPdfFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPdfFiles(full));
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) out.push(full);
  }
  return out.sort();
}

function makeBinary(buf) {
  if (typeof Binary !== 'undefined') return new Binary(buf);
  if (typeof BSON !== 'undefined' && BSON.Binary) return new BSON.Binary(buf);
  throw new Error('No BSON Binary constructor is available in this mongosh runtime.');
}

function flushBatch(filesBatch, chunksBatch) {
  if (filesBatch.length) db.getCollection('resumes.files').bulkWrite(filesBatch, { ordered: true });
  if (chunksBatch.length) db.getCollection('resumes.chunks').bulkWrite(chunksBatch, { ordered: true });
  filesBatch.length = 0;
  chunksBatch.length = 0;
}

const pdfFiles = walkPdfFiles(RESUME_DIR);
if (!pdfFiles.length) {
  throw new Error(`No PDF files found under ${RESUME_DIR}`);
}

print(`Found ${pdfFiles.length} source PDFs. Seeding ${TARGET_COUNT} GridFS files...`);

db.getCollection('resumes.files').deleteMany({});
db.getCollection('resumes.chunks').deleteMany({});

const filesBatch = [];
const chunksBatch = [];
let uploaded = 0;

for (let memberId = 1; memberId <= TARGET_COUNT; memberId += 1) {
  const source = pdfFiles[(memberId - 1) % pdfFiles.length];
  const data = fs.readFileSync(source);
  const fileId = `member_${String(memberId).padStart(6, '0')}`;
  const relativeSource = path.relative(ROOT, source);

  filesBatch.push({
    insertOne: {
      document: {
        _id: fileId,
        length: data.length,
        chunkSize: CHUNK_SIZE,
        uploadDate: new Date(),
        filename: path.basename(source),
        contentType: 'application/pdf',
        metadata: {
          member_id: memberId,
          source_path: relativeSource,
          source_index: (memberId - 1) % pdfFiles.length,
        },
      },
    },
  });

  let n = 0;
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    const chunk = Buffer.from(data.subarray(offset, Math.min(offset + CHUNK_SIZE, data.length)));
    chunksBatch.push({
      insertOne: {
        document: {
          files_id: fileId,
          n,
          data: makeBinary(chunk),
        },
      },
    });
    n += 1;
  }

  uploaded += 1;
  if (uploaded % 250 === 0) flushBatch(filesBatch, chunksBatch);
  if (uploaded % 1000 === 0) print(`Uploaded ${uploaded}/${TARGET_COUNT}`);
}

flushBatch(filesBatch, chunksBatch);

db.getCollection('resumes.files').createIndex({ filename: 1 });
db.getCollection('resumes.files').createIndex({ 'metadata.member_id': 1 }, { unique: true });
db.getCollection('resumes.chunks').createIndex({ files_id: 1, n: 1 }, { unique: true });

printjson({
  resumeFiles: db.getCollection('resumes.files').countDocuments(),
  resumeChunks: db.getCollection('resumes.chunks').countDocuments(),
  sourcePdfs: pdfFiles.length,
});
