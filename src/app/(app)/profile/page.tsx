import Link from "next/link";

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-3xl">Profile</h1>
      <Link
        href="/settings/life-areas"
        className="text-primary text-sm underline-offset-4 hover:underline"
      >
        Manage life areas
      </Link>
    </div>
  );
}
