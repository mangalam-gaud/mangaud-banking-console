import { Skeleton } from '../ui';

export function SkeletonLoanCard() {
  return (
    <div className="card-hover p-6 space-y-4 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Skeleton variant="text" width="30%" height={24} />
                <Skeleton variant="circular" width={24} height={24} />
              </div>
              <Skeleton variant="text" width="40%" />
              <div className="flex items-center gap-4 text-sm mt-2">
                <Skeleton variant="text" width="25%" />
                <Skeleton variant="text" width="25%" />
                <Skeleton variant="text" width="25%" />
              </div>
            </div>
            <div className="mt-4">
              <Skeleton variant="rectangular" height={8} className="rounded-full" />
              <div className="flex justify-between text-sm mt-1">
                <Skeleton variant="text" width="30%" />
                <Skeleton variant="text" width="40%" />
              </div>
            </div>
          </div>

          <div className="md:col-span-1">
            <div className="space-y-3 text-right">
              <div>
                <Skeleton variant="text" width="20%" />
                <Skeleton variant="text" width="60%" height={32} />
              </div>
              <div>
                <Skeleton variant="text" width="20%" />
                <Skeleton variant="text" width="60%" height={32} />
              </div>
              <div>
                <Skeleton variant="text" width="20%" />
                <Skeleton variant="text" width="40%" />
              </div>
              <div>
                <Skeleton variant="text" width="20%" />
                <Skeleton variant="text" width="50%" height={32} />
              </div>
            </div>
          </div>

          <div>
            <Skeleton variant="rectangular" width="100%" height={40} />
            <Skeleton variant="rectangular" width="100%" height={40} />
            <Skeleton variant="rectangular" width="100%" height={40} />
          </div>
        </div>
      </div>
    </div>
  );
}