import React from 'react';

export type Mark = {
  id: string;
  subject_id: string;
  student_id?: string;
  student_name?: string;
  value: number;
  comment?: string;
};

interface ViewMarksModalProps {
  open: boolean;
  onClose: () => void;
  marks: Mark[];
  subjectName: string;
}

const ViewMarksModal: React.FC<ViewMarksModalProps> = ({ open, onClose, marks, subjectName }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="bg-slate-900 rounded-xl shadow-lg p-8 w-full max-w-md relative">
        <button
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-400"
          onClick={onClose}
        >
          <span className="text-lg">×</span>
        </button>
        <h2 className="text-xl font-bold mb-4">Marks for {subjectName}</h2>
        {marks.length === 0 ? (
          <div className="text-slate-500">No marks found for this subject.</div>
        ) : (
          <ul className="space-y-2">
            {marks.map((mark) => (
              <li key={mark.id} className="flex justify-between items-center border-b pb-2">
                <span className="font-medium">{mark.value}</span>
                {mark.student_name && (
                  <span className="text-xs text-slate-300 ml-2">{mark.student_name}</span>
                )}
                {mark.comment && <span className="text-xs text-slate-500 ml-2">{mark.comment}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ViewMarksModal;
