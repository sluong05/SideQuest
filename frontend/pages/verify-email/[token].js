// Path-based variant of /verify-email?token=… — emailed links carry the token
// in the path so quoted-printable encoding can't corrupt a '='. The dynamic
// segment fills router.query.token, which the page component already reads.
export { default } from '../verify-email';
