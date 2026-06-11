import { useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useNicknameEdit(user: User | null, currentName: string, nicknameChangeTickets: number) {
  const queryClient = useQueryClient();
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameUpdating, setNameUpdating] = useState(false);

  const resolvedName = nameOverride ?? currentName;

  const startEdit = useCallback(() => {
    setNameInput(resolvedName);
    setIsEditingName(true);
  }, [resolvedName]);

  const cancelEdit = useCallback(() => {
    setIsEditingName(false);
    setNameInput('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!user) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === resolvedName) { cancelEdit(); return; }
    if (nicknameChangeTickets <= 0) {
      alert('닉네임 변경권이 없습니다. 상점에서 먼저 구매해 주세요.');
      return;
    }
    setNameUpdating(true);
    try {
      const res = await apiFetch('/api/profile/nickname', {
        method: 'POST',
        body: JSON.stringify({ displayName: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '닉네임 변경 실패');
      setNameOverride(trimmed);
      setIsEditingName(false);
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.uid] });
    } catch (e) {
      alert(e instanceof Error ? e.message : '이름 변경에 실패했습니다.');
    } finally {
      setNameUpdating(false);
    }
  }, [user, nameInput, resolvedName, nicknameChangeTickets, cancelEdit, queryClient]);

  return {
    resolvedName,
    isEditingName,
    nameInput,
    nameUpdating,
    setNameInput,
    startEdit,
    cancelEdit,
    saveEdit,
  };
}
