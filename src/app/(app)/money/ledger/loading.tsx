import {
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading-skeletons";

export default function LedgerLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <ListSkeleton rows={8} />
    </div>
  );
}
