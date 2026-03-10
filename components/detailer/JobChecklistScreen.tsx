import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { getChecklistForService } from '../../constants/checklistItems';
import { submitJobChecklist } from '../../services/jobChecklist';
import { capturePaymentForJob } from '../../services/paymentMethods';
import { updateJobStatus, type ActiveJobRow } from '../../services/detailers';

interface JobChecklistScreenProps {
  job: ActiveJobRow;
  onClose: () => void;
  onSubmit: () => void;
}

export function JobChecklistScreen({ job, onClose, onSubmit }: JobChecklistScreenProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveDetailerId = job.detailer_id ?? job.assigned_detailer_id ?? null;
  const sections = getChecklistForService(job.service_name ?? '');
  const allItems = sections.flatMap((s) => s.items);
  const total = allItems.length;

  const toggle = useCallback((label: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const checkedCount = allItems.filter((item) => checked.has(item)).length;
  const allChecked = total > 0 && checkedCount === total;

  const handleSubmit = async () => {
    if (!effectiveDetailerId || !allChecked) return;
    setLoading(true);
    setError(null);
    try {
      const completedItems = allItems.filter((item) => checked.has(item));
      await submitJobChecklist(job.id, effectiveDetailerId, completedItems);
      await capturePaymentForJob(job.id);
      await updateJobStatus(job.id, 'completed', effectiveDetailerId);
      onSubmit();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete job. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job Completion Checklist</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-2 space-y-6">
          <p className="text-sm text-gray-600">
            {job.service_name}
            {job.car_name?.trim() && ` · ${job.car_name.trim()}`}
          </p>

          <div>
            <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
              <span>{checkedCount} of {total} items checked</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-600 transition-all duration-200"
                style={{ width: `${total ? (checkedCount / total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.title}>
                <h4 className="font-semibold text-gray-900 mb-3">{section.title}</h4>
                <ul className="space-y-2">
                  {section.items.map((label) => (
                    <li key={label}>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={checked.has(label)}
                          onChange={() => toggle(label)}
                          className="w-5 h-5 rounded border-2 border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-gray-800 group-hover:text-black">{label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="pt-4 border-t border-gray-200 space-y-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!allChecked || loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-2xl font-black text-sm active:scale-[0.98] transition-all"
            >
              {loading ? 'Completing…' : 'Submit & Complete Job'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl font-bold text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
