// Path-based variant of /reset-password?token=… — emailed links carry the
// token in the path so quoted-printable encoding can't corrupt a '='. The
// dynamic segment fills router.query.token, which the page component reads.
export { default } from '../reset-password';
