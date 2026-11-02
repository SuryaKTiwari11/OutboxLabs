// =============================================================================
//  hooks/useSenders.ts
//  TanStack Query hooks for sender account management.
//  Pattern: custom hooks encapsulate query logic -> components stay clean.
// =============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sendersApi } from "../services/api";
import toast from "react-hot-toast";

export const senderKeys = {
  all: ["senders"] as const,
};

/** Fetch the list of active sender accounts for the current user. */
export function useSenders() {
  return useQuery({
    queryKey: senderKeys.all,
    queryFn:  sendersApi.list,
  });
}

/**
 * Mutation: auto-generate an Ethereal sender account.
 * On success, shows a long-lived toast with the one-time password
 * so the user can log into the Ethereal web inbox.
 */
export function useCreateEtherealSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName?: string) => sendersApi.createEthereal(displayName),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: senderKeys.all });
      if (data?.etherealPassOnce) {
        toast.success(
          `Sender created!\nEthereal login: ${data.etherealUser} / ${data.etherealPassOnce}`,
          { duration: 15000 }
        );
      } else {
        toast.success("Sender account created!");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Mutation: soft-delete a sender account. */
export function useDeleteSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendersApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: senderKeys.all });
      toast.success("Sender removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
