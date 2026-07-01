// Thin wrapper around react-hot-toast so pages can `import { notify }`.
// (The <Toaster/> itself lives in App.jsx.)
import toast from 'react-hot-toast';

export const notify = {
  success: (msg) => toast.success(msg),
  error: (msg) => toast.error(msg),
  loading: (msg) => toast.loading(msg),
  dismiss: (id) => toast.dismiss(id),
  promise: (p, msgs) => toast.promise(p, msgs),
};

export default notify;
