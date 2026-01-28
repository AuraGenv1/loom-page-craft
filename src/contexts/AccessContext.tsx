import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface AccessContextType {
  /** True admin status from database */
  isAdmin: boolean;
  /** User has paid for full access (from books.is_purchased or account flag) */
  isPaid: boolean;
  /** Effective access level considering simulation mode */
  hasFullAccess: boolean;
  /** Dev mode: simulate guest experience even as admin */
  simulateGuest: boolean;
  /** Toggle guest simulation mode */
  setSimulateGuest: (value: boolean) => void;
  /** Loading state while checking access */
  isLoading: boolean;
  /** Current book's purchased status */
  bookIsPurchased: boolean;
  /** Set current book's purchased status */
  setBookIsPurchased: (value: boolean) => void;
}

const AccessContext = createContext<AccessContextType | undefined>(undefined);

export const AccessProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [simulateGuest, setSimulateGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookIsPurchased, setBookIsPurchased] = useState(false);

  // Check admin role from database
  useEffect(() => {
    const checkAccess = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsPaid(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        // Check admin role
        const { data: adminData } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin',
        });
        setIsAdmin(adminData === true);

        // For now, isPaid is false by default (no Stripe integration yet)
        // In future: check user's subscription status or payment history
        setIsPaid(false);
      } catch (err) {
        console.error('Access check failed:', err);
        setIsAdmin(false);
        setIsPaid(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();
  }, [user]);

  // Effective access: admin OR paid, unless simulating guest
  const hasFullAccess = simulateGuest 
    ? false 
    : (isAdmin || isPaid || bookIsPurchased);

  return (
    <AccessContext.Provider value={{
      isAdmin,
      isPaid,
      hasFullAccess,
      simulateGuest,
      setSimulateGuest,
      isLoading,
      bookIsPurchased,
      setBookIsPurchased,
    }}>
      {children}
    </AccessContext.Provider>
  );
};

export const useAccess = () => {
  const context = useContext(AccessContext);
  if (context === undefined) {
    throw new Error('useAccess must be used within an AccessProvider');
  }
  return context;
};
