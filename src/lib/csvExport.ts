import { Booking, Payment, Expense } from '../types';
import { formatDisplayDate, formatDisplayDateTime } from './dateUtils';

function downloadCSV(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportBookingsToCSV(bookings: Booking[]) {
  const headers = [
    'Booking Number',
    'Customer Name',
    'Phone',
    'Homestay',
    'Room',
    'Room Type',
    'AC / Non-AC',
    'Check In Date',
    'Actual Check In Time',
    'Check Out Date',
    'Actual Check Out Time',
    'Checkout Method',
    'Nights',
    'Guests',
    'Rate Per Night (INR)',
    'Total Amount (INR)',
    'Total Paid (INR)',
    'Balance Due (INR)',
    'Referral / Brought By',
    'Commission Rate',
    'Commission Amount (INR)',
    'Commission Status',
    'Status',
    'Source',
    'Notes',
    'Created At',
  ];

  const rows = bookings.map((b) => {
    const totalPaid = b.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || b.total_paid || 0;
    const balanceDue = Number(b.total_amount) - totalPaid;
    const refPerson = b.referral_person?.name || b.manual_referral_name || 'Direct Booking';
    const commRateStr = b.referral_person_id
      ? `${b.commission_rate}${b.commission_type === 'percentage' ? '%' : ' INR'}`
      : '-';

    return [
      `"${b.booking_number || b.id}"`,
      `"${b.guest?.name || ''}"`,
      `"${b.guest?.phone || ''}"`,
      `"${b.room?.homestay?.name || ''}"`,
      `"${b.room?.name || ''}"`,
      `"${b.room?.room_type || 'Standard'}"`,
      `"${b.is_ac ? 'AC' : 'Non-AC'}"`,
      `"${b.check_in}"`,
      `"${b.check_in_at ? formatDisplayDateTime(b.check_in_at) : '-'}"`,
      `"${b.check_out}"`,
      `"${b.actual_checkout_at ? formatDisplayDateTime(b.actual_checkout_at) : '-'}"`,
      `"${b.checkout_method === 'automatic' ? 'Automatic (12 PM IST)' : 'Manual'}"`,
      `"${calculateNights(b.check_in, b.check_out)}"`,
      `"${b.num_guests}"`,
      `"${b.rate_per_night}"`,
      `"${b.total_amount}"`,
      `"${totalPaid}"`,
      `"${balanceDue}"`,
      `"${refPerson}"`,
      `"${commRateStr}"`,
      `"${b.commission_amount || 0}"`,
      `"${(b.commission_status || 'none').toUpperCase()}"`,
      `"${b.status.toUpperCase()}"`,
      `"${b.source}"`,
      `"${(b.notes || '').replace(/"/g, '""')}"`,
      `"${formatDisplayDateTime(b.created_at)}"`,
    ].join(',');
  });

  function calculateNights(cin: string, cout: string) {
    const d1 = new Date(cin);
    const d2 = new Date(cout);
    const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24));
    return diff > 0 ? diff : 0;
  }

  const csv = [headers.join(','), ...rows].join('\r\n');
  downloadCSV(csv, `homestay-bookings-${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportPaymentsToCSV(payments: Payment[]) {
  const headers = [
    'Payment ID',
    'Booking Number',
    'Customer Name',
    'Homestay',
    'Room',
    'Amount (INR)',
    'Method',
    'Paid On',
    'Note',
    'Received By',
    'Created At',
  ];

  const rows = payments.map((p) => [
    `"${p.id}"`,
    `"${p.booking?.booking_number || p.booking_id}"`,
    `"${p.booking?.guest?.name || ''}"`,
    `"${p.booking?.room?.homestay?.name || ''}"`,
    `"${p.booking?.room?.name || ''}"`,
    `"${p.amount}"`,
    `"${p.method.toUpperCase()}"`,
    `"${formatDisplayDate(p.paid_on)}"`,
    `"${(p.note || '').replace(/"/g, '""')}"`,
    `"${p.receiver?.full_name || ''}"`,
    `"${formatDisplayDateTime(p.created_at)}"`,
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\r\n');
  downloadCSV(csv, `homestay-payments-${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportExpensesToCSV(expenses: Expense[]) {
  const headers = [
    'Expense ID',
    'Homestay',
    'Category',
    'Amount (INR)',
    'Spent On',
    'Note',
    'Created By',
    'Created At',
  ];

  const rows = expenses.map((e) => [
    `"${e.id}"`,
    `"${e.homestay?.name || ''}"`,
    `"${e.category.toUpperCase()}"`,
    `"${e.amount}"`,
    `"${formatDisplayDate(e.spent_on)}"`,
    `"${(e.note || '').replace(/"/g, '""')}"`,
    `"${e.creator?.full_name || ''}"`,
    `"${formatDisplayDateTime(e.created_at)}"`,
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\r\n');
  downloadCSV(csv, `homestay-expenses-${new Date().toISOString().split('T')[0]}.csv`);
}
