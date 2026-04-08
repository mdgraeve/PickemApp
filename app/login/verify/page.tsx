export default function VerifyPage() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="w-full max-w-sm px-6 space-y-4 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 text-2xl">
          ✉
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Check your email</h1>
        <p className="text-slate-400">
          We sent you a sign-in link. Click it to continue.
        </p>
      </div>
    </div>
  );
}
