// Shown when a query id doesn't exist or belongs to another account.
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { SearchIcon } from "@/components/ui/icons";

export default function QueryNotFound() {
  return (
    <EmptyState
      icon={<SearchIcon className="h-5 w-5" />}
      title="Query not found"
      body="It may have been removed, or it belongs to another account."
      action={<ButtonLink href="/queries">Back to Queries</ButtonLink>}
    />
  );
}
