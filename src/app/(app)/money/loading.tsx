import {
  CardGridSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading-skeletons";

export default function MoneyLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <CardGridSkeleton cards={3} />
      <ListSkeleton rows={3} />
    </div>
  );
}
