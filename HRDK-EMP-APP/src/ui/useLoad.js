import { useCallback, useEffect, useState } from "react";
import { useLive } from "../api/live";

// Runs an API call on open; reload() for pull-to-refresh or after a change.
// live: kinds of change that reload it by themselves (api/live.js), quietly,
// without the loading spinner, e.g. useLoad(getLeave, [], { live: ["leave"] }).
export function useLoad(fn, deps = [], { live = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (quiet = false) => {
    if (quiet !== true) setLoading(true);
    try {
      setData(await fn());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  useLive(live, () => reload(true));

  return { data, error, loading, reload };
}
