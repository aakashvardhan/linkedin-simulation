import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { mockApplicants } from '../../data/mockApplicants';
import ApplicantCard from '../../components/recruiter/ApplicantCard';
import EmptyState from '../../components/shared/EmptyState';

export default function ApplicantList() {
  const { jobId } = useParams();
  const [applicants] = useState(mockApplicants);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Applicants</h1>
      <p className="text-sm text-gray-500 mb-6">Job ID: {jobId}</p>
      {applicants.length === 0 ? (
        <EmptyState title="No applicants yet" message="Applicants will appear here once they apply" />
      ) : (
        <div className="space-y-3">
          {applicants.map((a) => <ApplicantCard key={a.id} applicant={a} jobId={jobId} />)}
        </div>
      )}
    </div>
  );
}
