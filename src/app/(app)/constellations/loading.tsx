import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading-skeletons";

export default function ConstellationsLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <CardGridSkeleton cards={9} />
    </div>
  );
}
