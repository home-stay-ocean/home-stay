import React, { useState, useEffect } from 'react';
import { Room } from '../../types';
import { Modal } from '../common/Modal';
import { api } from '../../lib/supabase';
import { useHomestay } from '../../contexts/HomestayContext';
import { useToast } from '../common/Toast';
import { BedDouble, Building, Wind } from 'lucide-react';

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomToEdit?: Room | null;
  defaultHomestayId?: string;
  onSaved: () => void;
}

export const RoomModal: React.FC<RoomModalProps> = ({
  isOpen,
  onClose,
  roomToEdit,
  defaultHomestayId,
  onSaved,
}) => {
  const { allHomestays } = useHomestay();
  const { showToast, showError } = useToast();

  const [homestayId, setHomestayId] = useState('');
  const [name, setName] = useState('');
  const [roomType, setRoomType] = useState('Standard');
  const [isAc, setIsAc] = useState<boolean>(true);
  const [defaultRate, setDefaultRate] = useState<number>(2500);
  const [active, setActive] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (roomToEdit) {
      setHomestayId(roomToEdit.homestay_id);
      setName(roomToEdit.name);
      setRoomType(roomToEdit.room_type || 'Standard');
      setIsAc(roomToEdit.is_ac ?? true);
      setDefaultRate(roomToEdit.default_rate);
      setActive(roomToEdit.active);
    } else {
      setHomestayId(defaultHomestayId || allHomestays[0]?.id || '');
      setName('');
      setRoomType('Standard');
      setIsAc(true);
      setDefaultRate(2500);
      setActive(true);
    }
  }, [roomToEdit, defaultHomestayId, allHomestays, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !homestayId) {
      showToast('Fields Required', 'Please provide room name and property.', 'warning');
      return;
    }

    try {
      setLoading(true);
      await api.saveRoom({
        id: roomToEdit?.id,
        homestay_id: homestayId,
        name: name.trim(),
        room_type: roomType.trim() || 'Standard',
        is_ac: isAc,
        default_rate: Number(defaultRate),
        active,
      });

      showToast('Room Saved', `${name} (${isAc ? 'AC' : 'Non-AC'}) is configured.`);
      onSaved();
      onClose();
    } catch (err: any) {
      showError(err, 'Failed to save room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={roomToEdit ? 'Edit Room' : 'Add New Room'}
      subtitle="Configure room tier, AC specifications, nightly rate, and availability"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Homestay Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-brand-600" />
            Homestay Property *
          </label>
          <select
            value={homestayId}
            onChange={(e) => setHomestayId(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            {allHomestays.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.location})
              </option>
            ))}
          </select>
        </div>

        {/* Room Name & Room Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5 text-brand-600" />
              Room Name / Unit *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Room 101"
              required
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Room Type
            </label>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="Standard">Standard</option>
              <option value="Deluxe">Deluxe</option>
              <option value="Super Deluxe">Super Deluxe</option>
              <option value="Suite">Suite</option>
              <option value="Family Room">Family Room</option>
              <option value="Cottage">Cottage / Villa</option>
            </select>
          </div>
        </div>

        {/* AC vs Non-AC Selection */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
              isAc ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-200 text-slate-700'
            }`}>
              <Wind className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                {isAc ? 'Air Conditioned (AC Room)' : 'Non-AC Room'}
              </p>
              <p className="text-[11px] text-slate-500">
                Determines AC / Non-AC tag and commission categorization
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAc(!isAc)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
              isAc
                ? 'bg-cyan-600 text-white border-cyan-700 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            {isAc ? 'AC Enabled' : 'Non-AC'}
          </button>
        </div>

        {/* Default Rate */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Default Rate per Night (₹) *
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold">
              ₹
            </span>
            <input
              type="number"
              min="0"
              value={defaultRate}
              onChange={(e) => setDefaultRate(Number(e.target.value))}
              required
              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Active Toggle */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-800 block">Active Status</span>
            <span className="text-[11px] text-slate-500">
              Inactive rooms are hidden from the calendar and new bookings.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActive(!active)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
              active ? 'bg-brand-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                active ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Submit Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-md shadow-brand-600/20 disabled:opacity-50"
          >
            {loading ? 'Saving...' : roomToEdit ? 'Save Changes' : 'Create Room'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
