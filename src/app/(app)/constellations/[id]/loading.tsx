import { DetailPageSkeleton } from "@/components/loading-skeletons";

export default function ConstellationDetailLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <DetailPageSkeleton />
    </div>
  );
}
