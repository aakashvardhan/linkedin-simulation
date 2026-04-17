import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockApplicants } from '../../data/mockApplicants';
import ApplicantStatusDropdown from '../../components/recruiter/ApplicantStatusDropdown';
import { ArrowLeft, Mail, MapPin, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ApplicantDetail() {
  const { appId } = useParams();
  const navigate = useNavigate();
  const applicant = mockApplicants.find((a) => a.id === appId) || mockApplicants[0];
  const [status, setStatus] = useState(applicant.status);
  const [notes, setNotes] = useState(applicant.notes);

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    toast.success(`Status updated to ${newStatus}`);
  };

  const handleSaveNotes = () => {
    toast.success('Notes saved!');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Applicants
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex gap-4 items-start">
          <img src={applicant.avatar} alt="" className="w-20 h-20 rounded-full object-cover" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">{applicant.name}</h1>
            <p className="text-gray-600">{applicant.headline}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{applicant.location}</span>
              <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" />{applicant.experience}</span>
              <span className="flex items-center gap-1"><Mail className="w-4 h-4" />{applicant.email}</span>
            </div>
          </div>
          <ApplicantStatusDropdown status={status} onChange={handleStatusChange} />
        </div>

        <div className="mt-6">
          <h3 className="font-semibold text-gray-800 mb-2">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {applicant.skills.map((skill, i) => (
              <span key={i} className="px-3 py-1 bg-linkedin-light text-linkedin text-xs rounded-full">{skill}</span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold text-gray-800 mb-2">Applied</h3>
          <p className="text-sm text-gray-600">{applicant.appliedDate}</p>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold text-gray-800 mb-2">Recruiter Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Add notes about this applicant..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-linkedin focus:outline-none"
          />
          <button onClick={handleSaveNotes} className="mt-2 px-6 py-2 bg-linkedin text-white rounded-full text-sm font-medium hover:bg-linkedin-dark">
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
}
