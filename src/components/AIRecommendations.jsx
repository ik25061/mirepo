import { useAuth } from '../context/AuthContext.jsx';
import ArtistSelector from './ArtistSelector.jsx';

export default function AIRecommendations() {
  const { user } = useAuth();

  return (
    
        <ArtistSelector userId={user?.id} />
  );
}
