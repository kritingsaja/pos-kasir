import { redirect } from 'next/navigation';

export default function DeprecatedSuperadminLoginPage() {
    redirect('/login');
}
