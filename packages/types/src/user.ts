export type UserRole =
  | 'super-admin'
  | 'rector'
  | 'prorector'
  | 'dean'
  | 'head-of-department'
  | 'teacher'
  | 'student'
  | 'parent'
  | 'hr'
  | 'accountant'
  | 'librarian'
  | 'psychologist'
  | 'it-staff'
  | 'security'
  | 'guest';

export type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended' | 'archived';

export type User = {
  id: string;
  email: string;
  username?: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  roles: UserRole[];
  status: UserStatus;
  email_verified_at?: string | null;
  phone_verified_at?: string | null;
  two_factor_enabled: boolean;
  locale: 'uz' | 'ru' | 'en';
  timezone: string;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  user: User;
  token?: string;
  expires_at: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  remember?: boolean;
  two_factor_code?: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  password_confirmation: string;
  first_name: string;
  last_name: string;
  locale?: 'uz' | 'ru' | 'en';
};
