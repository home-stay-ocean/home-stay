import React, { useState } from 'react';
import { ActiveScreen, Booking } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HomestayProvider, useHomestay } from './contexts/HomestayContext';
import { ToastProvider } from './components/common/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { BookingsPage } from './pages/BookingsPage';
import { CalendarPage } from './pages/CalendarPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BasicStatsPage } from './pages/BasicStatsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { SetupPage } from './pages/SetupPage';
import { UsersPage } from './pages/UsersPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { CustomersPage } from './pages/CustomersPage';
import { ReferralsPage } from './pages/ReferralsPage';

// Modals
import { BookingModal } from './components/bookings/BookingModal';
import { PaymentModal } from './components/bookings/PaymentModal';
import { BookingDetailsModal } from './components/bookings/BookingDetailsModal';
import { ExpenseModal } from './components/expenses/ExpenseModal';

function MainApp() {
  const { user, role, loading: authLoading } = useAuth();
  const { refresh: refreshHomestays } = useHomestay();

  const [currentScreen, setCurrentScreen] = useState<ActiveScreen>('dashboard');

  // Modal States
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingToEdit, setBookingToEdit] = useState<Booking | null>(null);
  const [bookingInitialRoomId, setBookingInitialRoomId] = useState<string | undefined>();
  const [bookingInitialDate, setBookingInitialDate] = useState<string | undefined>();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentBooking, setPaymentBooking] = useState<Booking | null>(null);

  const [isBookingDetailsOpen, setIsBookingDetailsOpen] = useState(false);
  const [detailsBooking, setDetailsBooking] = useState<Booking | null>(null);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Refresh key to re-trigger lists when a booking/payment changes
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => {
    setRefreshKey((k) => k + 1);
    refreshHomestays();
  };

  // Handlers
  const handleOpenNewBooking = (roomId?: string, date?: string) => {
    setBookingToEdit(null);
    setBookingInitialRoomId(roomId);
    setBookingInitialDate(date);
    setIsBookingModalOpen(true);
  };

  const handleOpenEditBooking = (b: Booking) => {
    setBookingToEdit(b);
    setBookingInitialRoomId(undefined);
    setBookingInitialDate(undefined);
    setIsBookingModalOpen(true);
  };

  const handleOpenPaymentModal = (b: Booking) => {
    setPaymentBooking(b);
    setIsPaymentModalOpen(true);
  };

  const handleSelectBooking = (b: Booking) => {
    setDetailsBooking(b);
    setIsBookingDetailsOpen(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-semibold">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading Homestay Manager...</p>
        </div>
      </div>
    );
  }

  // If no user session, show Login Page
  if (!user) {
    return <LoginPage />;
  }

  const isSuperAdmin = role === 'super_admin';
  const isOwnerOrAdmin = role === 'super_admin' || role === 'owner';

  return (
    <AppLayout
      currentScreen={currentScreen}
      onSelectScreen={setCurrentScreen}
    >
      {/* Screen Router */}
      <div key={refreshKey}>
        {currentScreen === 'dashboard' && (
          <DashboardPage
            onOpenNewBooking={handleOpenNewBooking}
            onOpenNewExpense={() => setIsExpenseModalOpen(true)}
            onSelectBooking={handleSelectBooking}
            onNavigateToSetup={() => setCurrentScreen('setup')}
          />
        )}

        {currentScreen === 'bookings' && (
          <BookingsPage
            onOpenNewBooking={() => handleOpenNewBooking()}
            onOpenEditBooking={handleOpenEditBooking}
            onOpenPaymentModal={handleOpenPaymentModal}
            onSelectBooking={handleSelectBooking}
          />
        )}

        {currentScreen === 'calendar' && (
          <CalendarPage
            onOpenNewBooking={handleOpenNewBooking}
            onSelectBooking={handleSelectBooking}
          />
        )}

        {currentScreen === 'analytics' && (
          isOwnerOrAdmin ? <AnalyticsPage /> : <BasicStatsPage />
        )}

        {currentScreen === 'basic_stats' && (
          <BasicStatsPage />
        )}

        {currentScreen === 'expenses' && (
          <ExpensesPage
            onOpenNewExpense={() => setIsExpenseModalOpen(true)}
          />
        )}

        {currentScreen === 'setup' && (
          isOwnerOrAdmin ? <SetupPage /> : <DashboardPage onOpenNewBooking={handleOpenNewBooking} onOpenNewExpense={() => setIsExpenseModalOpen(true)} onSelectBooking={handleSelectBooking} />
        )}

        {currentScreen === 'customers' && (
          <CustomersPage onSelectBooking={handleSelectBooking} />
        )}

        {currentScreen === 'referrals' && (
          isOwnerOrAdmin ? <ReferralsPage /> : <DashboardPage onOpenNewBooking={handleOpenNewBooking} onOpenNewExpense={() => setIsExpenseModalOpen(true)} onSelectBooking={handleSelectBooking} />
        )}

        {currentScreen === 'users' && (
          isSuperAdmin ? <UsersPage /> : <DashboardPage onOpenNewBooking={handleOpenNewBooking} onOpenNewExpense={() => setIsExpenseModalOpen(true)} onSelectBooking={handleSelectBooking} />
        )}

        {currentScreen === 'activity_log' && (
          isSuperAdmin ? <ActivityLogPage /> : <DashboardPage onOpenNewBooking={handleOpenNewBooking} onOpenNewExpense={() => setIsExpenseModalOpen(true)} onSelectBooking={handleSelectBooking} />
        )}
      </div>

      {/* Global Modals */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        bookingToEdit={bookingToEdit}
        initialRoomId={bookingInitialRoomId}
        initialDate={bookingInitialDate}
        onBookingSaved={triggerRefresh}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentBooking(null);
        }}
        booking={paymentBooking}
        onPaymentRecorded={triggerRefresh}
      />

      <BookingDetailsModal
        isOpen={isBookingDetailsOpen}
        onClose={() => {
          setIsBookingDetailsOpen(false);
          setDetailsBooking(null);
        }}
        booking={detailsBooking}
        onOpenPaymentModal={handleOpenPaymentModal}
        onOpenEditModal={handleOpenEditBooking}
        onRefresh={triggerRefresh}
      />

      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onExpenseAdded={triggerRefresh}
      />
    </AppLayout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HomestayProvider>
          <MainApp />
        </HomestayProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
