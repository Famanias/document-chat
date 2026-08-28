export type MemberAccount = Readonly<{
  id: string;
  providerSubject: string;
  email: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}>;

export type MemberSession = Readonly<{
  userId: string;
  email: string;
  workspaceId: string;
}>;
