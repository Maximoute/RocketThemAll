export interface AuthUser {
  id: string;
  discordId: string;
  isAdmin: boolean;
}

export type RequestUser = AuthUser;
