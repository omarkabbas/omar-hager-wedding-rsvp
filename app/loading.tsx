export default function Loading() {
  return (
    <div className="wedding-shell wedding-center px-4 py-10">
      <div className="wedding-backdrop" />
      <div className="wedding-page-panel wedding-animate-fade max-w-lg text-center">
        <div className="mx-auto mb-6 h-16 w-16 animate-pulse rounded-full bg-stone-100" />
        <p className="wedding-kicker mb-3">Loading</p>
        <h1 className="wedding-state-title mb-3">Please wait</h1>
        <p className="wedding-lead">Preparing your wedding experience...</p>
      </div>
    </div>
  );
}
