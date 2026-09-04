import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading-skeletons";

export default function DreamsLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <CardGridSkeleton cards={8} />
    </div>
  );
}
