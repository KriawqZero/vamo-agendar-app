export default function BookingLoading() {
    return (
        <div className="min-h-dvh bg-palco">
            <div className="mx-auto w-full max-w-md sm:border-x sm:border-fio">
                <div className="h-16 w-full animate-pulse bg-veu" />
                <div className="space-y-4 px-5 pt-8">
                    <div className="h-16 w-16 animate-pulse rounded-2xl bg-veu" />
                    <div className="h-7 w-2/3 animate-pulse rounded-lg bg-veu" />
                    <div className="h-4 w-full animate-pulse rounded bg-veu" />
                    <div className="mt-6 space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-20 animate-pulse rounded-2xl bg-veu" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
