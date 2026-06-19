import { create } from 'zustand';

export interface ClubMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface PendingRequest {
  userId: string;
  username: string;
  requestedAt: string;
}

export interface MyClub {
  id: string;
  name: string;
  ownerId: string;
  members: ClubMember[];
  inviteCode: string;
  pendingRequests: PendingRequest[];
  settings: Record<string, unknown>;
  createdAt: string;
}

interface ClubStore {
  myClub: MyClub | null;
  loading: boolean;
  initialized: boolean;
  setMyClub: (club: MyClub | null) => void;
  setLoading: (v: boolean) => void;
  setInitialized: (v: boolean) => void;
}

export const useClubStore = create<ClubStore>((set) => ({
  myClub: null,
  loading: false,
  initialized: false,
  setMyClub: (myClub) => set({ myClub }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),
}));
