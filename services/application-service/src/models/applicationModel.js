const db = require('../config/db');

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ─── submitApplication ────────────────────────────────────────────────────────

async function submitApplication(job_id, member_id, resume_url, cover_letter) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [jobs] = await connection.execute(
      'SELECT job_id, status FROM job_postings WHERE job_id = ?',
      [job_id]
    );
    if (jobs.length === 0) throw makeError('Job not found', 404);
    if (jobs[0].status === 'closed') {
      throw makeError('This job posting is closed and no longer accepting applications', 400);
    }

    const [members] = await connection.execute(
      'SELECT member_id, location_city, location_state FROM members WHERE member_id = ?',
      [member_id]
    );
    if (members.length === 0) throw makeError('Member not found', 404);

    const { location_city, location_state } = members[0];

    const [result] = await connection.execute(
      `INSERT INTO applications
         (job_id, member_id, resume_url, cover_letter, status, application_datetime)
       VALUES (?, ?, ?, ?, 'submitted', NOW())`,
      [job_id, member_id, resume_url || null, cover_letter || null]
    );

    await connection.execute(
      'UPDATE job_postings SET applicants_count = applicants_count + 1 WHERE job_id = ?',
      [job_id]
    );

    await connection.commit();

    return {
      application_id: result.insertId,
      location_city:  location_city  || null,
      location_state: location_state || null,
    };
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw makeError('You have already applied to this job', 409);
    }
    throw err;
  } finally {
    connection.release();
  }
}

// ─── getApplication ───────────────────────────────────────────────────────────

async function getApplication(application_id) {
  const [rows] = await db.execute(
    `SELECT
       a.*,
       j.title        AS job_title,
       j.location,
       j.work_mode,
       c.name         AS company_name,
       m.first_name,
       m.last_name
     FROM applications  a
     JOIN job_postings  j ON a.job_id     = j.job_id
     JOIN companies     c ON j.company_id = c.company_id
     JOIN members       m ON a.member_id  = m.member_id
     WHERE a.application_id = ?`,
    [application_id]
  );
  return rows[0] || null;
}

// ─── getApplicationsByJob ─────────────────────────────────────────────────────
// KEY FIX: Use db.query() instead of db.execute() for any SQL that contains
// dynamic string interpolation (ORDER BY column name, IN clause with arrays).
// mysql2's execute() uses prepared statements which CANNOT handle:
//   1. Interpolated column names in ORDER BY
//   2. Array parameters for IN clauses
// db.query() sends raw SQL — safe here because col/order come from a whitelist
// and memberIds come from DB results (not user input).

async function getApplicationsByJob(
  job_id,
  recruiter_id,
  { page = 1, page_size = 20, status, sort_by = 'application_datetime', sort_order = 'desc' } = {}
) {
  // 1. Job existence + ownership check — simple query, execute() is fine
  const [jobs] = await db.execute(
    'SELECT job_id, recruiter_id FROM job_postings WHERE job_id = ?',
    [job_id]
  );
  if (jobs.length === 0) throw makeError('Job not found', 404);
  if (String(jobs[0].recruiter_id) !== String(recruiter_id)) {
    throw makeError('Only the recruiter who posted this job can view its applications', 403);
  }

  // Cast to Number — required for LIMIT/OFFSET
  const pageNum     = Number(page);
  const pageSizeNum = Number(page_size);
  const offset      = (pageNum - 1) * pageSizeNum;

  // Whitelist sort column and direction to prevent SQL injection
  const allowedSortCols = ['application_datetime', 'status'];
  const col   = allowedSortCols.includes(sort_by) ? sort_by : 'application_datetime';
  const order = sort_order === 'asc' ? 'ASC' : 'DESC';

  // 2. Count query — no dynamic interpolation, execute() is fine
  let countSql    = 'SELECT COUNT(*) AS total FROM applications WHERE job_id = ?';
  const countParams = [job_id];

  if (status) {
    countSql += ' AND status = ?';
    countParams.push(status);
  }

  const [[{ total }]] = await db.execute(countSql, countParams);

  // 3. Data query — HAS dynamic ORDER BY interpolation so MUST use query()
  // query() does not use prepared statements — interpolates values directly.
  let dataSql    = `
    SELECT
      a.application_id,
      a.member_id,
      a.job_id,
      a.resume_url,
      a.cover_letter,
      a.status,
      a.application_datetime,
      a.recruiter_notes,
      a.updated_at,
      m.first_name,
      m.last_name,
      m.headline,
      m.profile_photo_url,
      m.resume_url AS member_resume_url
    FROM applications a
    JOIN members m ON a.member_id = m.member_id
    WHERE a.job_id = ?`;

  const dataParams = [job_id];

  if (status) {
    dataSql += ' AND a.status = ?';
    dataParams.push(status);
  }

  // Interpolate ORDER BY directly (whitelisted above — safe)
  // Pass LIMIT and OFFSET as Numbers in the params array
  dataSql += ` ORDER BY a.${col} ${order} LIMIT ? OFFSET ?`;
  dataParams.push(pageSizeNum, offset);

  // KEY: db.query() not db.execute() — handles interpolated SQL correctly
  const [rows] = await db.query(dataSql, dataParams);

  // 4. Skills batch fetch — array IN clause, MUST use query()
  if (rows.length > 0) {
    const memberIds   = rows.map((r) => Number(r.member_id));
    const [skillRows] = await db.query(
      'SELECT member_id, skill_name FROM member_skills WHERE member_id IN (?)',
      [memberIds]
    );

    // Group skills by member_id
    const skillsMap = {};
    for (const s of skillRows) {
      if (!skillsMap[s.member_id]) skillsMap[s.member_id] = [];
      skillsMap[s.member_id].push(s.skill_name);
    }

    // Attach skills array to each row
    for (const row of rows) {
      row.skills = skillsMap[row.member_id] || [];
    }
  }

  return {
    applications: rows,
    total_count:  Number(total),
    page:         pageNum,
    page_size:    pageSizeNum,
    total_pages:  Math.ceil(Number(total) / pageSizeNum),
  };
}

// ─── getApplicationsByMember ──────────────────────────────────────────────────

async function getApplicationsByMember(
  member_id,
  { page = 1, page_size = 20, status } = {}
) {
  const [members] = await db.execute(
    'SELECT member_id FROM members WHERE member_id = ?',
    [member_id]
  );
  if (members.length === 0) throw makeError('Member not found', 404);

  const pageNum     = Number(page);
  const pageSizeNum = Number(page_size);
  const offset      = (pageNum - 1) * pageSizeNum;

  let countSql    = 'SELECT COUNT(*) AS total FROM applications WHERE member_id = ?';
  const countParams = [member_id];

  if (status) {
    countSql += ' AND status = ?';
    countParams.push(status);
  }

  const [[{ total }]] = await db.execute(countSql, countParams);

  let dataSql    = `
    SELECT
      a.application_id,
      a.job_id,
      a.status,
      a.application_datetime,
      a.updated_at,
      j.title        AS job_title,
      j.location,
      j.work_mode,
      c.name         AS company_name,
      c.logo_url     AS company_logo_url
    FROM applications  a
    JOIN job_postings  j ON a.job_id     = j.job_id
    JOIN companies     c ON j.company_id = c.company_id
    WHERE a.member_id = ?`;

  const dataParams = [member_id];

  if (status) {
    dataSql += ' AND a.status = ?';
    dataParams.push(status);
  }

  dataSql += ' ORDER BY a.application_datetime DESC LIMIT ? OFFSET ?';
  dataParams.push(pageSizeNum, offset);

  // Use query() for consistency — has LIMIT/OFFSET params
  const [rows] = await db.query(dataSql, dataParams);

  return {
    applications: rows,
    total_count:  Number(total),
    page:         pageNum,
    page_size:    pageSizeNum,
    total_pages:  Math.ceil(Number(total) / pageSizeNum),
  };
}

// ─── updateStatus ─────────────────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  submitted: ['reviewing'],
  reviewing: ['interview', 'rejected'],
  interview: ['offer', 'rejected'],
  offer:     [],
  rejected:  [],
};

async function updateStatus(application_id, recruiter_id, new_status) {
  const [rows] = await db.execute(
    `SELECT a.status AS current_status, a.member_id, a.job_id, j.recruiter_id
     FROM applications a
     JOIN job_postings j ON a.job_id = j.job_id
     WHERE a.application_id = ?`,
    [application_id]
  );
  if (rows.length === 0) throw makeError('Application not found', 404);

  const { current_status, member_id, job_id, recruiter_id: job_recruiter_id } = rows[0];

  if (String(job_recruiter_id) !== String(recruiter_id)) {
    throw makeError('Only the recruiter who posted this job can update application status', 403);
  }

  const allowed = VALID_TRANSITIONS[current_status] || [];
  if (!allowed.includes(new_status)) {
    throw makeError(
      `Invalid status transition: cannot move from '${current_status}' to '${new_status}'`,
      400
    );
  }

  await db.execute(
    'UPDATE applications SET status = ?, updated_at = NOW() WHERE application_id = ?',
    [new_status, application_id]
  );

  return { previous_status: current_status, new_status, member_id, job_id };
}

// ─── addNote ──────────────────────────────────────────────────────────────────

async function addNote(application_id, recruiter_id, note) {
  const [rows] = await db.execute(
    `SELECT a.application_id, j.recruiter_id
     FROM applications a
     JOIN job_postings j ON a.job_id = j.job_id
     WHERE a.application_id = ?`,
    [application_id]
  );
  if (rows.length === 0) throw makeError('Application not found', 404);

  if (String(rows[0].recruiter_id) !== String(recruiter_id)) {
    throw makeError('Only the recruiter who posted this job can add notes to applications', 403);
  }

  await db.execute(
    'UPDATE applications SET recruiter_notes = ?, updated_at = NOW() WHERE application_id = ?',
    [note, application_id]
  );
}

module.exports = {
  submitApplication,
  getApplication,
  getApplicationsByJob,
  getApplicationsByMember,
  updateStatus,
  addNote,
};