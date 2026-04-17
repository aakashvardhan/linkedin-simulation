export default function ApplicantStatusDropdown({ status, onChange }) {
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-linkedin focus:outline-none"
    >
      <option value="applied">Applied</option>
      <option value="screening">Screening</option>
      <option value="shortlisted">Shortlisted</option>
      <option value="interview">Interview</option>
      <option value="offered">Offered</option>
      <option value="rejected">Rejected</option>
    </select>
  );
}
