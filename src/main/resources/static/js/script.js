document.addEventListener('DOMContentLoaded', () => {
    const createPostForm = document.getElementById('createPostForm');
    const postsContainer = document.getElementById('postsContainer');

    // Function to fetch and display posts
    async function fetchPosts() {
        try {
            const response = await fetch('/api/posts');
            const posts = await response.json();
            postsContainer.innerHTML = ''; // Clear existing posts

            if (posts.length === 0) {
                postsContainer.innerHTML = '<p>No posts yet. Be the first to create one!</p>';
                return;
            }

            posts.forEach(post => {
                const postDiv = document.createElement('div');
                postDiv.classList.add('post-item');
                postDiv.innerHTML = `
                    <h3>${post.title}</h3>
                    <p>${post.content}</p>
                    <div class="timestamp">Posted on: ${new Date(post.createdAt).toLocaleString()}</div>
                `;
                postsContainer.appendChild(postDiv);
            });
        } catch (error) {
            console.error('Error fetching posts:', error);
            postsContainer.innerHTML = '<p>Error loading posts. Please try again later.</p>';
        }
    }

    // Function to handle form submission
    createPostForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent default form submission

        const title = document.getElementById('title').value;
        const content = document.getElementById('content').value;

        try {
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title, content }),
            });

            if (response.ok) {
                document.getElementById('title').value = '';
                document.getElementById('content').value = '';
                fetchPosts(); // Refresh the list of posts
            } else {
                alert('Failed to create post. Please try again.');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            alert('An error occurred while creating the post.');
        }
    });

    // Initial fetch of posts when the page loads
    fetchPosts();
});