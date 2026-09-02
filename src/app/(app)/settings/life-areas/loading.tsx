import {
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading-skeletons";

export default function LifeAreasLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <ListSkeleton rows={4} />
    </div>
  );
}
