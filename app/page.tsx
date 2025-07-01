import { redirect } from 'next/navigation';

export default function RedirectToLogin() {
  redirect('/login');
}