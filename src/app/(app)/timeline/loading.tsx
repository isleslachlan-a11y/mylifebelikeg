import {
  PageHeaderSkeleton,
  TimelineSkeleton,
} from "@/components/loading-skeletons";

export default function TimelineLoading() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <TimelineSkeleton />
    </main>
  );
}
