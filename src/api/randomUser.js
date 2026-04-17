import axios from 'axios';

export async function getRandomUsers(count = 10) {
  try {
    const { data } = await axios.get(`https://randomuser.me/api/?results=${count}&nat=us`);
    return data.results.map((u) => ({
      id: u.login.uuid,
      name: `${u.name.first} ${u.name.last}`,
      email: u.email,
      avatar: u.picture.large,
      thumbnail: u.picture.thumbnail,
      location: `${u.location.city}, ${u.location.state}`,
      phone: u.phone,
    }));
  } catch {
    return Array.from({ length: count }, (_, i) => ({
      id: `mock-${i}`,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      avatar: `https://i.pravatar.cc/150?img=${i + 1}`,
      thumbnail: `https://i.pravatar.cc/50?img=${i + 1}`,
      location: 'New York, NY',
      phone: '555-0100',
    }));
  }
}
