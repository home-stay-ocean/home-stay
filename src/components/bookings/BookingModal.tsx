import React, { useState, useEffect } from 'react';
import { Booking, BookingSource, BookingStatus, ReferralPerson, CommissionType } from '../../types';
import { Modal } from '../common/Modal';
import { api } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useHomestay } from '../../contexts/HomestayContext';
import { useToast } from '../common/Toast';
import { formatCurrency, BOOKING_SOURCES } from '../../lib/constants';
import { calculateNights, getTodayISO, getTomorrowISO, normalizePhoneNumber } from '../../lib/dateUtils';
import { Search, UserCheck, AlertTriangle, Wind, UserPlus, Users2, DollarSign, HelpCircle } from 'lucide-react';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingToEdit?: Booking | null;
  initialRoomId?: string;
  initialDate?: string;
  onBookingSaved: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  bookingToEdit,
  initialRoomId,
  initialDate,
  onBookingSaved,
}) => {
  const { user } = useAuth();
  const { homestays, rooms } = useHomestay();
  const { showToast, showError } = useToast();

  // Customer / Guest fields
  const [guestPhone, setGuestPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestIdNote, setGuestIdNote] = useState('');
  const [existingGuestId, setExistingGuestId] = useState<string | null>(null);
  const [isSearchingGuest, setIsSearchingGuest] = useState(false);

  // Booking details
  const [selectedHomestayId, setSelectedHomestayId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [isAc, setIsAc] = useState<boolean>(true);
  const [checkIn, setCheckIn] = useState<string>(getTodayISO());
  const [checkOut, setCheckOut] = useState<string>(getTomorrowISO());
  const [numGuests, setNumGuests] = useState<number>(2);
  const [ratePerNight, setRatePerNight] = useState<number>(2500);
  const [source, setSource] = useState<BookingSource>('phone');
  const [status, setStatus] = useState<BookingStatus>('booked');
  const [notes, setNotes] = useState<string>('');

  // Referral / Brought By fields
  const [referralPersons, setReferralPersons] = useState<ReferralPerson[]>([]);
  const [selectedReferralId, setSelectedReferralId] = useState<string>('direct'); // 'direct', 'manual', or UUID
  const [manualReferralName, setManualReferralName] = useState<string>('');
  const [commissionType, setCommissionType] = useState<CommissionType>('percentage');
  const [commissionRate, setCommissionRate] = useState<number>(10);

  const [loading, setLoading] = useState(false);

  // Load referral persons
  useEffect(() => {
    if (isOpen) {
      api.getReferralPersons(true).then((list) => {
        setReferralPersons(list);
      });
    }
  }, [isOpen]);

  // Filter rooms by selected homestay
  const availableRooms = rooms.filter(
    (r) => !selectedHomestayId || r.homestay_id === selectedHomestayId
  );

  // Initialize form state
  useEffect(() => {
    if (bookingToEdit) {
      setGuestPhone(bookingToEdit.guest?.phone || '');
      setGuestName(bookingToEdit.guest?.name || '');
      setGuestIdNote(bookingToEdit.guest?.id_proof_note || '');
      setExistingGuestId(bookingToEdit.guest_id);

      const homestayId =
        bookingToEdit.room?.homestay_id ||
        rooms.find((r) => r.id === bookingToEdit.room_id)?.homestay_id ||
        '';
      if (homestayId) {
        setSelectedHomestayId(homestayId);
      }
      setRoomId(bookingToEdit.room_id);
      setIsAc(bookingToEdit.is_ac ?? bookingToEdit.room?.is_ac ?? true);
      setCheckIn(bookingToEdit.check_in);
      setCheckOut(bookingToEdit.check_out);
      setNumGuests(bookingToEdit.num_guests);
      setRatePerNight(bookingToEdit.rate_per_night);
      setSource(bookingToEdit.source);
      setStatus(bookingToEdit.status);
      setNotes(bookingToEdit.notes || '');

      // Referral state
      if (bookingToEdit.referral_person_id) {
        setSelectedReferralId(bookingToEdit.referral_person_id);
        setManualReferralName('');
      } else if (bookingToEdit.manual_referral_name) {
        setSelectedReferralId('manual');
        setManualReferralName(bookingToEdit.manual_referral_name);
      } else {
        setSelectedReferralId('direct');
        setManualReferralName('');
      }
      setCommissionType(bookingToEdit.commission_type || 'percentage');
      setCommissionRate(bookingToEdit.commission_rate || 0);
    } else {
      // New Booking setup
      const defaultHomestay = homestays[0]?.id || '';
      setSelectedHomestayId(defaultHomestay);

      const matchedRoom = initialRoomId
        ? rooms.find((r) => r.id === initialRoomId)
        : rooms.find((r) => r.homestay_id === defaultHomestay) || rooms[0];

      if (matchedRoom) {
        setSelectedHomestayId(matchedRoom.homestay_id);
        setRoomId(matchedRoom.id);
        setRatePerNight(matchedRoom.default_rate);
        setIsAc(matchedRoom.is_ac ?? true);
      }

      const start = initialDate || getTodayISO();
      setCheckIn(start);
      const d = new Date(start);
      d.setDate(d.getDate() + 1);
      setCheckOut(d.toISOString().split('T')[0]);

      setGuestPhone('');
      setGuestName('');
      setGuestIdNote('');
      setExistingGuestId(null);
      setNumGuests(2);
      setSource('phone');
      setStatus('booked');
      setNotes('');

      setSelectedReferralId('direct');
      setManualReferralName('');
      setCommissionType('percentage');
      setCommissionRate(0);
    }
  }, [bookingToEdit, initialRoomId, initialDate, isOpen, homestays, rooms]);

  // When room changes, auto-fill default rate and AC spec
  const handleRoomChange = (newRoomId: string) => {
    setRoomId(newRoomId);
    const room = rooms.find((r) => r.id === newRoomId);
    if (room) {
      setRatePerNight(room.default_rate);
      setIsAc(room.is_ac ?? true);
    }
  };

  // Lookup guest by normalized phone number as user types
  useEffect(() => {
    const rawClean = guestPhone.trim();
    if (rawClean.length >= 7 && !bookingToEdit) {
      setIsSearchingGuest(true);
      const timer = setTimeout(async () => {
        try {
          const guest = await api.findGuestByPhone(rawClean);
          if (guest) {
            setExistingGuestId(guest.id);
            setGuestName(guest.name);
            if (guest.id_proof_note) setGuestIdNote(guest.id_proof_note);
          } else {
            setExistingGuestId(null);
          }
        } catch {
          // ignore lookup error
        } finally {
          setIsSearchingGuest(false);
        }
      }, 350);

      return () => clearTimeout(timer);
    } else if (rawClean.length < 7) {
      setExistingGuestId(null);
    }
  }, [guestPhone, bookingToEdit]);

  // When referral selection changes, update commission rate snapshot defaults
  const handleReferralChange = (refId: string) => {
    setSelectedReferralId(refId);
    if (refId === 'direct') {
      setManualReferralName('');
      setCommissionRate(0);
    } else if (refId === 'manual') {
      setCommissionType('percentage');
      setCommissionRate(10);
    } else {
      const rp = referralPersons.find((p) => p.id === refId);
      if (rp) {
        setCommissionType(rp.commission_type);
        setCommissionRate(rp.default_commission_rate);
      }
    }
  };

  // Calculations
  const nights = calculateNights(checkIn, checkOut);
  const totalAmount = nights * ratePerNight;

  // Calculate snapshot commission amount
  const calculatedCommission =
    selectedReferralId === 'direct'
      ? 0
      : commissionType === 'percentage'
      ? Math.round(((totalAmount * commissionRate) / 100) * 100) / 100
      : commissionRate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!guestPhone.trim() || !guestName.trim()) {
      showToast('Guest Info Required', 'Please provide guest name and mobile contact number.', 'warning');
      return;
    }

    if (!roomId) {
      showToast('Room Required', 'Please select a room for this booking.', 'warning');
      return;
    }

    if (nights <= 0) {
      showToast('Invalid Dates', 'Check-out date must be strictly after check-in date.', 'warning');
      return;
    }

    try {
      setLoading(true);

      // 1. Atomic Customer Upsert (Prevents duplicate customer creation)
      const guest = await api.upsertCustomer({
        id: existingGuestId || undefined,
        name: guestName.trim(),
        phone: guestPhone.trim(),
        id_proof_note: guestIdNote.trim() || null,
      });

      // 2. Prepare Referral & Commission snapshot
      const isReferred = selectedReferralId !== 'direct';
      const refPersonId = isReferred && selectedReferralId !== 'manual' ? selectedReferralId : null;
      const manualName = selectedReferralId === 'manual' ? manualReferralName.trim() : null;

      // 3. Save booking with atomic conflict prevention
      await api.saveBooking(
        {
          id: bookingToEdit?.id,
          guest_id: guest.id,
          room_id: roomId,
          check_in: checkIn,
          check_out: checkOut,
          num_guests: numGuests,
          rate_per_night: ratePerNight,
          total_amount: totalAmount,
          is_ac: isAc,
          status,
          source,
          notes: notes.trim() || null,
          referral_person_id: refPersonId,
          manual_referral_name: manualName,
          commission_type: isReferred ? commissionType : null,
          commission_rate: isReferred ? commissionRate : 0,
          commission_amount: isReferred ? calculatedCommission : 0,
        },
        user?.id
      );

      showToast(
        bookingToEdit ? 'Booking Updated' : 'Booking Created Successfully!',
        `${guest.name} • ${isAc ? 'AC' : 'Non-AC'} • ${nights} nights • Total ${formatCurrency(totalAmount)}`
      );

      onBookingSaved();
      onClose();
    } catch (err: any) {
      showError(err, 'Booking could not be saved');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={bookingToEdit ? 'Edit Reservation' : 'New Reservation'}
      subtitle={bookingToEdit ? `Ref: ${bookingToEdit.booking_number || bookingToEdit.id}` : 'Create reservation with customer reuse & commission snapshot'}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Customer Section with Automatic Deduplication & Search */}
        <div className="p-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-brand-600" />
              Customer Lookup & Details
            </span>
            {existingGuestId ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                <UserCheck className="w-3.5 h-3.5" />
                Existing Customer Reused (No Duplicate)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                <UserPlus className="w-3 h-3" />
                New Customer Profile
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Customer Mobile Phone *
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="e.g. 9876543210 or +91..."
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
                {isSearchingGuest && (
                  <div className="absolute right-3 top-2.5 text-xs text-brand-600 animate-spin">
                    ⏳
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Normalized as Indian +91 format to prevent duplicate customer profiles.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Customer Full Name *
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              ID Proof Note (Aadhaar / Driving License / Passport)
            </label>
            <input
              type="text"
              value={guestIdNote}
              onChange={(e) => setGuestIdNote(e.target.value)}
              placeholder="e.g. Aadhaar XXXX-1234 (Verified at desk)"
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 2. Room & Property Selection */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Homestay Property
              </label>
              <select
                value={selectedHomestayId}
                onChange={(e) => {
                  setSelectedHomestayId(e.target.value);
                  const firstRoom = rooms.find((r) => r.homestay_id === e.target.value);
                  if (firstRoom) handleRoomChange(firstRoom.id);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none"
              >
                {homestays.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Room / Unit *
              </label>
              <select
                value={roomId}
                onChange={(e) => handleRoomChange(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-none"
              >
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.room_type || 'Standard'}, {r.is_ac ? 'AC' : 'Non-AC'}) — {formatCurrency(r.default_rate)}/night
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AC / Non-AC Toggle for this booking */}
          <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-cyan-600" />
              <div>
                <span className="text-xs font-bold text-slate-800">
                  {isAc ? 'Air Conditioned (AC)' : 'Non-AC Booking'}
                </span>
                <span className="text-[11px] text-slate-500 ml-2 hidden sm:inline">
                  (Recorded and filterable across reports)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAc(!isAc)}
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                isAc
                  ? 'bg-cyan-600 text-white border-cyan-700'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              {isAc ? 'AC Room' : 'Non-AC Room'}
            </button>
          </div>
        </div>

        {/* 3. Dates & Nightly Pricing */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Check-In Date *
              </label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Check-Out Date *
              </label>
              <input
                type="date"
                value={checkOut}
                min={checkIn}
                onChange={(e) => setCheckOut(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
              <span className="text-[10px] text-brand-700 font-semibold block mt-1">
                Auto Check-Out: 12:00 PM IST
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Rate / Night (₹) *
              </label>
              <input
                type="number"
                min="0"
                value={ratePerNight}
                onChange={(e) => setRatePerNight(Number(e.target.value))}
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Number of Guests
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={numGuests}
                onChange={(e) => setNumGuests(Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Booking Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as BookingSource)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              >
                {BOOKING_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 4. Referral Person / Brought By & Commission Snapshot */}
        <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <Users2 className="w-3.5 h-3.5 text-amber-700" />
              Referred By / Brought By & Commission
            </span>
            <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
              Snapshot Locked
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Select Referral Person / Agent
              </label>
              <select
                value={selectedReferralId}
                onChange={(e) => handleReferralChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="direct">Direct Booking / No Referral</option>
                {referralPersons.map((rp) => (
                  <option key={rp.id} value={rp.id}>
                    {rp.name} ({rp.phone}) — {rp.commission_type === 'percentage' ? `${rp.default_commission_rate}%` : `₹${rp.default_commission_rate}`}
                  </option>
                ))}
                <option value="manual">Other / Enter Manual Referral Name</option>
              </select>
            </div>

            {selectedReferralId === 'manual' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Manual Referral Person Name *
                </label>
                <input
                  type="text"
                  value={manualReferralName}
                  onChange={(e) => setManualReferralName(e.target.value)}
                  placeholder="e.g. Local Driver Ravi"
                  required
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {selectedReferralId !== 'direct' && (
            <div className="p-3 bg-white border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block uppercase">Type</label>
                  <select
                    value={commissionType}
                    onChange={(e) => setCommissionType(e.target.value as CommissionType)}
                    className="mt-0.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 text-xs"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block uppercase">Rate</label>
                  <input
                    type="number"
                    min="0"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(Number(e.target.value))}
                    className="mt-0.5 w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                <span className="text-[11px] text-slate-500 font-medium">Snapshot Commission:</span>
                <p className="text-base font-extrabold text-amber-700">
                  {formatCurrency(calculatedCommission)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 5. Reservation Status & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Reservation Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BookingStatus)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="booked">Booked (Confirmed reservation)</option>
              <option value="checked_in">Checked In (Guest arrived)</option>
              <option value="checked_out">Checked Out (Completed)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Special Notes / Instructions
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Late arrival, extra mattress requested"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
            />
          </div>
        </div>

        {/* 6. Pricing Summary Banner */}
        <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {nights} {nights === 1 ? 'Night' : 'Nights'} • {isAc ? 'AC Room' : 'Non-AC Room'} • {formatCurrency(ratePerNight)}/night
            </p>
            <p className="text-xl font-extrabold text-white mt-0.5">
              Total: {formatCurrency(totalAmount)}
            </p>
          </div>

          {selectedReferralId !== 'direct' && (
            <div className="text-right">
              <span className="text-[10px] text-amber-400 block font-semibold uppercase">
                Referral Commission
              </span>
              <span className="text-sm font-extrabold text-amber-300">
                {formatCurrency(calculatedCommission)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
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
            {loading ? 'Processing...' : bookingToEdit ? 'Save Changes' : 'Confirm Reservation'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
