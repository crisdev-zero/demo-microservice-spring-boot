package com.example.demomicroservice;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Controller
public class PostController {

    @Autowired
    private PostRepository postRepository;

    // --- Frontend Endpoints ---
    @GetMapping("/")
    public String showPostsPage(Model model) {
        // Retrieve posts sorted by creation date (newest first)
        List<Post> posts = postRepository.findAll();
        posts.sort(Comparator.comparing(Post::getCreatedAt).reversed());
        model.addAttribute("posts", posts);
        model.addAttribute("newPost", new Post()); // For the form
        return "posts"; // Refers to src/main/resources/templates/posts.html
    }

    // --- REST API Endpoints (for JavaScript to consume) ---

    @PostMapping("/api/posts")
    @ResponseBody // Indicates that the return value should be bound to the web response body
    public ResponseEntity<Post> createPost(@RequestBody Post post) {
        Post savedPost = postRepository.save(post);
        return ResponseEntity.ok(savedPost);
    }

    @GetMapping("/api/posts")
    @ResponseBody
    public ResponseEntity<List<Post>> getAllPosts() {
        // Sort posts by creation date (newest first) for API too
        List<Post> posts = postRepository.findAll();
        posts.sort(Comparator.comparing(Post::getCreatedAt).reversed());
        return ResponseEntity.ok(posts);
    }
}