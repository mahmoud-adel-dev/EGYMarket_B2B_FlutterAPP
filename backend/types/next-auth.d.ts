import { DefaultSession, DefaultUser } from 'next-auth';

/**
 * User roles supported in the B2B marketplace backend architecture.
 */
export type UserRole = 'Admin' | 'Wholesaler' | 'Retailer' | 'Shipper';
export type OrganizationMemberRole = 'owner' | 'manager' | 'staff';

declare module 'next-auth' {
  /**
   * Extends the built-in Session model to include custom role and user id
   */
  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId?: string;
      organizationMemberRole?: OrganizationMemberRole;
    } & DefaultSession['user'];
  }

  /**
   * Extends the built-in User model to include custom role
   */
  interface User extends DefaultUser {
    id: string;
    role: UserRole;
    organizationId?: string;
    sessionVersion?: number;
  }
}
