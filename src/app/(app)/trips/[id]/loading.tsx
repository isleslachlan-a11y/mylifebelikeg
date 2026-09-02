import { DetailPageSkeleton } from "@/components/loading-skeletons";

export default function TripDetailLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <DetailPageSkeleton />
    </div>
  );
}
