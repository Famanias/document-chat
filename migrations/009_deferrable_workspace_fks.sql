ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_workspace_chat_fk;
ALTER TABLE messages
  ADD CONSTRAINT messages_workspace_chat_fk
  FOREIGN KEY (workspace_id, chat_id)
  REFERENCES chats(workspace_id, id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE chat_documents DROP CONSTRAINT IF EXISTS chat_documents_workspace_chat_fk;
ALTER TABLE chat_documents
  ADD CONSTRAINT chat_documents_workspace_chat_fk
  FOREIGN KEY (workspace_id, chat_id)
  REFERENCES chats(workspace_id, id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE chat_documents DROP CONSTRAINT IF EXISTS chat_documents_workspace_document_fk;
ALTER TABLE chat_documents
  ADD CONSTRAINT chat_documents_workspace_document_fk
  FOREIGN KEY (workspace_id, document_id)
  REFERENCES documents(workspace_id, id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS document_chunks_workspace_document_fk;
ALTER TABLE document_chunks
  ADD CONSTRAINT document_chunks_workspace_document_fk
  FOREIGN KEY (workspace_id, document_id)
  REFERENCES documents(workspace_id, id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE guest_sessions DROP CONSTRAINT IF EXISTS guest_sessions_workspace_chat_fk;
ALTER TABLE guest_sessions
  ADD CONSTRAINT guest_sessions_workspace_chat_fk
  FOREIGN KEY (workspace_id, chat_id)
  REFERENCES chats(workspace_id, id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
