package com.spotchzxk.ops;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.DeleteUsersResult;
import com.google.firebase.auth.ExportedUserRecord;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.ListUsersPage;

import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.List;

public class DeleteFirebaseGuestUsers {

    private static final int DELETE_BATCH_SIZE = 1000;

    public static void main(String[] args) throws Exception {
        boolean execute = hasArg(args, "--execute");
        String serviceAccountPath = argValue(args, "--service-account");
        if (serviceAccountPath == null || serviceAccountPath.isBlank()) {
            serviceAccountPath = System.getenv().getOrDefault(
                    "FIREBASE_SERVICE_ACCOUNT_PATH",
                    "serviceAccountKey.json"
            );
        }

        initFirebase(serviceAccountPath);

        List<String> anonymousUids = new ArrayList<>();
        ListUsersPage page = FirebaseAuth.getInstance().listUsers(null);
        while (page != null) {
            for (ExportedUserRecord user : page.getValues()) {
                if (user.getProviderData().length == 0) {
                    anonymousUids.add(user.getUid());
                }
            }
            page = page.getNextPage();
        }

        System.out.printf("Firebase anonymous users found: %d%n", anonymousUids.size());
        anonymousUids.stream()
                .limit(20)
                .forEach(uid -> System.out.printf("  %s%n", uid));
        if (anonymousUids.size() > 20) {
            System.out.printf("  ... and %d more%n", anonymousUids.size() - 20);
        }

        if (!execute) {
            System.out.println("Dry-run only. Re-run with --execute to delete these Firebase Auth users.");
            return;
        }

        int successCount = 0;
        int failureCount = 0;
        for (int start = 0; start < anonymousUids.size(); start += DELETE_BATCH_SIZE) {
            int batchStart = start;
            int end = Math.min(start + DELETE_BATCH_SIZE, anonymousUids.size());
            DeleteUsersResult result = FirebaseAuth.getInstance()
                    .deleteUsers(anonymousUids.subList(start, end));
            successCount += result.getSuccessCount();
            failureCount += result.getFailureCount();
            result.getErrors().forEach(error ->
                    System.out.printf("Failed to delete index=%d reason=%s%n",
                            batchStart + error.getIndex(),
                            error.getReason())
            );
        }

        System.out.printf("Deleted Firebase anonymous users: success=%d failure=%d%n",
                successCount,
                failureCount);
    }

    private static void initFirebase(String serviceAccountPath) throws Exception {
        if (!FirebaseApp.getApps().isEmpty()) {
            return;
        }
        try (FileInputStream serviceAccount = new FileInputStream(serviceAccountPath)) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                    .build();
            FirebaseApp.initializeApp(options);
        }
    }

    private static boolean hasArg(String[] args, String name) {
        for (String arg : args) {
            if (name.equals(arg)) {
                return true;
            }
        }
        return false;
    }

    private static String argValue(String[] args, String name) {
        for (int i = 0; i < args.length - 1; i++) {
            if (name.equals(args[i])) {
                return args[i + 1];
            }
        }
        return null;
    }
}
